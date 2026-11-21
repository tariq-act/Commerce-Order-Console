import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { inventoryMovements, orderItems, orders, products } from "../db/schema";
import type { Order } from "../db/types";
import { createOrderSchema, orderIdParamsSchema, updateOrderStatusSchema } from "../lib/validations/order";

export class OrderPlacementError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "INSUFFICIENT_STOCK" | "INVENTORY_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "OrderPlacementError";
  }
}

export type CreatedOrder = Pick<Order, "id" | "reference" | "status" | "totalCents" | "createdAt"> & {
  items: {
    productId: number;
    productName: string;
    quantity: number;
    unitPriceCents: number;
  }[];
};

export function createOrder(input: unknown): CreatedOrder {
  const { items } = createOrderSchema.parse(input);
  try {
    // Keep this callback synchronous: better-sqlite3 commits when it returns.
    return db.transaction((tx) => {
      const availableProducts = tx.select().from(products)
        .where(inArray(products.id, items.map((item) => item.productId))).all();
      const byId = new Map(availableProducts.map((product) => [product.id, product]));
      let total = BigInt(0);

      // Validate the entire order before inserting rows or deducting any stock.
      const snapshots = items.map(({ productId, quantity }) => {
        const product = byId.get(productId);
        if (!product) {
          throw new OrderPlacementError(404, "NOT_FOUND", `Product ${productId} not found.`);
        }
        if (product.stock < quantity) {
          throw new OrderPlacementError(409, "INSUFFICIENT_STOCK", `Insufficient stock for product ${productId}.`);
        }
        total += BigInt(product.priceCents) * BigInt(quantity);
        if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new OrderPlacementError(400, "VALIDATION_ERROR", "Order total exceeds the supported integer paise range.");
        }
        return { productId, productName: product.name, quantity, unitPriceCents: product.priceCents };
      });

      const order = tx.insert(orders).values({
        reference: `ORD-${randomUUID()}`,
        status: "PLACED",
        totalCents: Number(total),
      }).returning().get();

      for (const item of snapshots) {
        const deduction = tx.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` })
          .where(and(eq(products.id, item.productId), gte(products.stock, item.quantity))).run();
        if (deduction.changes !== 1) {
          throw new OrderPlacementError(409, "INVENTORY_CONFLICT", "Inventory changed. Please try placing the order again.");
        }
        tx.insert(orderItems).values({
          orderId: order.id, productId: item.productId,
          quantity: item.quantity, unitPriceCents: item.unitPriceCents,
        }).run();
        tx.insert(inventoryMovements).values({
          orderId: order.id, productId: item.productId,
          type: "ORDER_PLACED", quantity: item.quantity,
        }).run();
      }

      return {
        id: order.id, reference: order.reference, status: order.status,
        items: snapshots, totalCents: order.totalCents, createdAt: order.createdAt,
      };
    }, { behavior: "immediate" });
  } catch (error) {
    // The installed better-sqlite3 adapter propagates native SQLite errors.
    if (error instanceof Error && "code" in error && typeof error.code === "string"
      && /^(SQLITE_BUSY|SQLITE_LOCKED)(_|$)/.test(error.code)) {
      throw new OrderPlacementError(409, "INVENTORY_CONFLICT", "Inventory is busy. Please try placing the order again.");
    }
    throw error;
  }
}

export class OrderTransitionError extends Error {
  constructor(
    public readonly status: 404 | 409,
    public readonly code: "NOT_FOUND" | "INVALID_TRANSITION" | "INVENTORY_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

type OrderTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function runOrderTransition<T>(operation: (tx: OrderTransaction) => T): T {
  try {
    return db.transaction(operation, { behavior: "immediate" });
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "string") {
      if (/^(SQLITE_BUSY|SQLITE_LOCKED)(_|$)/.test(error.code)) {
        throw new OrderTransitionError(409, "INVENTORY_CONFLICT", "Order is busy. Please try again.");
      }
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        // Do not ignore duplicate restoration records: the stock update must roll back.
        throw new OrderTransitionError(409, "INVENTORY_CONFLICT", "Inventory restoration was already recorded. The order was not changed.");
      }
    }
    throw error;
  }
}

function findOrderForTransition(tx: OrderTransaction, id: number): Order {
  const order = tx.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) throw new OrderTransitionError(404, "NOT_FOUND", "Order not found.");
  return order;
}

function transitionOrder(tx: OrderTransaction, order: Order, status: Order["status"]): Order {
  const updated = tx.update(orders).set({ status })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status))).returning().get();
  if (!updated) {
    throw new OrderTransitionError(409, "INVALID_TRANSITION", "Order status changed. Please refresh the order and try again.");
  }
  return updated;
}

export function updateOrderStatus(id: string, input: unknown): Order {
  const { id: orderId } = orderIdParamsSchema.parse({ id });
  const { status } = updateOrderStatusSchema.parse(input);
  return runOrderTransition((tx) => {
    const order = findOrderForTransition(tx, orderId);
    if (!((order.status === "PLACED" && status === "PACKED")
      || (order.status === "PACKED" && status === "SHIPPED"))) {
      throw new OrderTransitionError(409, "INVALID_TRANSITION", `Cannot change order status from ${order.status} to ${status}.`);
    }
    return transitionOrder(tx, order, status);
  });
}

export function cancelOrder(id: string): Order {
  const { id: orderId } = orderIdParamsSchema.parse({ id });
  return runOrderTransition((tx) => {
    const order = findOrderForTransition(tx, orderId);
    if (order.status !== "PLACED" && order.status !== "PACKED") {
      throw new OrderTransitionError(409, "INVALID_TRANSITION", `Cannot cancel an order with status ${order.status}.`);
    }
    const cancelled = transitionOrder(tx, order, "CANCELLED");
    const items = tx.select().from(orderItems).where(eq(orderItems.orderId, order.id)).all();
    for (const item of items) {
      // Guard the existing safe-integer stock limit as well as the product ID.
      const restoration = tx.update(products).set({ stock: sql`${products.stock} + ${item.quantity}` })
        .where(and(eq(products.id, item.productId), lte(products.stock, Number.MAX_SAFE_INTEGER - item.quantity))).run();
      if (restoration.changes !== 1) {
        throw new OrderTransitionError(409, "INVENTORY_CONFLICT", "Inventory cannot be restored safely. The order was not changed.");
      }
      tx.insert(inventoryMovements).values({
        orderId: order.id, productId: item.productId,
        type: "ORDER_CANCELLED", quantity: item.quantity,
      }).run();
    }
    return cancelled;
  });
}
