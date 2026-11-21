import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders, products } from "../db/schema";
import type { Order } from "../db/types";
import type { OrderQuery } from "../lib/validations/order";

const summaryFields = {
  id: orders.id,
  reference: orders.reference,
  status: orders.status,
  totalCents: orders.totalCents,
  createdAt: orders.createdAt,
};

export type OrderSummary = Pick<Order, "id" | "reference" | "status" | "totalCents" | "createdAt">;
export type OrderPage = {
  orders: OrderSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
export type OrderDetails = OrderSummary & {
  items: {
    id: number;
    productId: number;
    productName: string;
    sku: string;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
  }[];
};

export function listOrders({ search, status, page, limit }: OrderQuery): OrderPage {
  const filter = and(
    search ? sql`instr(lower(${orders.reference}), ${search.toLowerCase()}) > 0` : undefined,
    status ? eq(orders.status, status) : undefined,
  );

  // Count and page share one read snapshot even if another connection writes.
  return db.transaction((tx) => {
    const total = tx.select({ total: count() }).from(orders).where(filter).get()?.total ?? 0;
    const rows = tx.select(summaryFields).from(orders).where(filter)
      .orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit).offset((page - 1) * limit).all();
    return { orders: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  });
}

export function getOrderById(id: number): OrderDetails | undefined {
  return db.transaction((tx) => {
    const order = tx.select(summaryFields).from(orders).where(eq(orders.id, id)).get();
    if (!order) return undefined;

    const items = tx.select({
      id: orderItems.id,
      productId: orderItems.productId,
      productName: products.name,
      sku: products.sku,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
    }).from(orderItems).innerJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id)).all();

    return {
      ...order,
      items: items.map((item) => {
        const subtotal = BigInt(item.unitPriceCents) * BigInt(item.quantity);
        if (subtotal > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("Order item subtotal exceeds the supported integer paise range.");
        }
        return { ...item, subtotalCents: Number(subtotal) };
      }),
    };
  });
}
