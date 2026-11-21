import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { inventoryMovements, orderItems, orders, products } from "../db/schema";
import type { Order } from "../db/types";
import { createOrderSchema } from "../lib/validations/order";

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
