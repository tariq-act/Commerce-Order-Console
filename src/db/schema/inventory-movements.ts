import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { orders } from "./orders";
import { products } from "./products";

export const inventoryMovementTypes = ["ORDER_PLACED", "ORDER_CANCELLED"] as const;

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict", onUpdate: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict", onUpdate: "cascade" }),
    type: text("type", { enum: inventoryMovementTypes }).notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("inventory_movements_order_product_type_unique").on(
      table.orderId,
      table.productId,
      table.type,
    ),
    index("inventory_movements_product_created_at_idx").on(table.productId, table.createdAt),
    check(
      "inventory_movements_type_check",
      sql`${table.type} IN ('ORDER_PLACED', 'ORDER_CANCELLED')`,
    ),
    check(
      "inventory_movements_quantity_check",
      sql`typeof(${table.quantity}) = 'integer' AND ${table.quantity} BETWEEN 1 AND 9007199254740991`,
    ),
  ],
);
