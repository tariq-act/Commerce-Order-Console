import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { orders } from "./orders";
import { products } from "./products";

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict", onUpdate: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict", onUpdate: "cascade" }),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("order_items_order_product_unique").on(table.orderId, table.productId),
    index("order_items_product_id_idx").on(table.productId),
    check(
      "order_items_quantity_check",
      sql`typeof(${table.quantity}) = 'integer' AND ${table.quantity} BETWEEN 1 AND 9007199254740991`,
    ),
    check(
      "order_items_unit_price_cents_check",
      sql`typeof(${table.unitPriceCents}) = 'integer' AND ${table.unitPriceCents} BETWEEN 0 AND 9007199254740991`,
    ),
  ],
);
