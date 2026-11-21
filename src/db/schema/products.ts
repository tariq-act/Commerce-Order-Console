import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  stock: integer("stock").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
    .default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("products_sku_unique").on(table.sku),
  check("products_price_cents_check", sql`typeof(${table.priceCents}) = 'integer' AND ${table.priceCents} BETWEEN 0 AND 9007199254740991`),
  check("products_stock_check", sql`typeof(${table.stock}) = 'integer' AND ${table.stock} BETWEEN 0 AND 9007199254740991`),
]);
