import { count, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { inventoryMovements, orders, products } from "../db/schema";
import type { InventoryMovement, Product } from "../db/types";
import type { PaginationQuery } from "../lib/validations/pagination";
import type { ProductQuery } from "../lib/validations/product";
import { getProductById, listProducts } from "./product.service";

export type InventoryRecord = Pick<Product, "id" | "name" | "sku" | "priceCents" | "stock"> & {
  availability: "in_stock" | "out_of_stock";
};
export type InventoryMovementRecord = InventoryMovement & { orderReference: string };
export type InventoryMovementPage = {
  product: InventoryRecord;
  movements: InventoryMovementRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

function toInventoryRecord(product: Product): InventoryRecord {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    priceCents: product.priceCents,
    stock: product.stock,
    availability: product.stock > 0 ? "in_stock" : "out_of_stock",
  };
}

export function listInventory(query: ProductQuery = {}): InventoryRecord[] {
  return listProducts(query).map(toInventoryRecord);
}

export function getInventoryByProductId(productId: number): InventoryRecord | undefined {
  const product = getProductById(productId);
  return product ? toInventoryRecord(product) : undefined;
}

export function listInventoryMovements(
  productId: number,
  { page, limit }: PaginationQuery,
): InventoryMovementPage | undefined {
  // Product, count, and history are read from the same consistent SQLite snapshot.
  return db.transaction((tx) => {
    const product = tx.select().from(products).where(eq(products.id, productId)).get();
    if (!product) return undefined;

    const filter = eq(inventoryMovements.productId, productId);
    const total =
      tx.select({ total: count() }).from(inventoryMovements).where(filter).get()?.total ?? 0;
    const movements = tx
      .select({
        id: inventoryMovements.id,
        productId: inventoryMovements.productId,
        orderId: inventoryMovements.orderId,
        orderReference: orders.reference,
        type: inventoryMovements.type,
        quantity: inventoryMovements.quantity,
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(orders, eq(orders.id, inventoryMovements.orderId))
      .where(filter)
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
      .limit(limit)
      .offset((page - 1) * limit)
      .all();

    return {
      product: toInventoryRecord(product),
      movements,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  });
}
