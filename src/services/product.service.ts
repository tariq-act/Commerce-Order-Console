import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { products } from "../db/schema";
import type { ProductQuery } from "../lib/validations/product";

export function listProducts({ search, stock }: ProductQuery = {}) {
  const term = search?.toLowerCase();
  // Bound parameters and instr treat SQL wildcard characters as literal text.
  const searchFilter = term ? or(
    sql`instr(lower(${products.name}), ${term}) > 0`,
    sql`instr(lower(${products.sku}), ${term}) > 0`,
  ) : undefined;
  const stockFilter = stock === "in_stock" ? gt(products.stock, 0)
    : stock === "out_of_stock" ? eq(products.stock, 0) : undefined;

  return db.select().from(products).where(and(searchFilter, stockFilter))
    .orderBy(asc(products.id)).all();
}

export function getProductById(id: number) {
  return db.select().from(products).where(eq(products.id, id)).get();
}
