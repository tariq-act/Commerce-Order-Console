import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const orderStatuses = ["PLACED", "PACKED", "SHIPPED", "CANCELLED"] as const;

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reference: text("reference").notNull(),
    status: text("status", { enum: orderStatuses }).notNull().default("PLACED"),
    totalCents: integer("total_cents").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("orders_reference_unique").on(table.reference),
    index("orders_status_created_at_idx").on(table.status, table.createdAt),
    index("orders_created_at_idx").on(table.createdAt),
    check(
      "orders_status_check",
      sql`${table.status} IN ('PLACED', 'PACKED', 'SHIPPED', 'CANCELLED')`,
    ),
    check(
      "orders_total_cents_check",
      sql`typeof(${table.totalCents}) = 'integer' AND ${table.totalCents} BETWEEN 0 AND 9007199254740991`,
    ),
  ],
);
