import { asc, count, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { orderItems, orders, products } from "../db/schema";
import type { DashboardData } from "../features/dashboard/types/dashboard";

function safeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Dashboard aggregate exceeds the supported integer range.");
  }
  return value;
}

export function getDashboard(): DashboardData {
  const lowStockThreshold = z.coerce
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .parse(process.env.DASHBOARD_LOW_STOCK_THRESHOLD ?? 5);

  // All sections share one SQLite read snapshot. Aggregation covers every order,
  // independently of list pagination; SQLite SUM retains integer paise arithmetic.
  return db.transaction((tx) => {
    const metrics = tx
      .select({
        totalOrders: count(),
        pendingOrders:
          sql<number>`coalesce(sum(case when ${orders.status} = 'PLACED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        shippedOrders:
          sql<number>`coalesce(sum(case when ${orders.status} = 'SHIPPED' then 1 else 0 end), 0)`.mapWith(
            Number,
          ),
        totalRevenueCents:
          sql<number>`coalesce(sum(case when ${orders.status} <> 'CANCELLED' then ${orders.totalCents} else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(orders)
      .get()!;
    for (const value of Object.values(metrics)) safeInteger(value);

    const latest = tx
      .select({
        id: orders.id,
        reference: orders.reference,
        status: orders.status,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(5)
      .as("latest_orders");
    const recentOrders = tx
      .select({
        id: latest.id,
        reference: latest.reference,
        status: latest.status,
        totalCents: latest.totalCents,
        createdAt: latest.createdAt,
        itemCount: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number),
      })
      .from(latest)
      .leftJoin(orderItems, eq(orderItems.orderId, latest.id))
      .groupBy(latest.id)
      .orderBy(desc(latest.createdAt), desc(latest.id))
      .all()
      .map((order) => ({
        ...order,
        itemCount: safeInteger(order.itemCount),
        createdAt: order.createdAt.toISOString(),
      }));

    const lowStockProducts = tx
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        stock: products.stock,
      })
      .from(products)
      .where(lte(products.stock, lowStockThreshold))
      .orderBy(asc(products.stock), asc(products.id))
      .all();

    return {
      metrics,
      recentOrders,
      lowStockProducts,
      lowStockThreshold,
      generatedAt: new Date().toISOString(),
    };
  });
}
