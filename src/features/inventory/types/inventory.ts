import { z } from "zod";
import type {
  InventoryRecord,
  InventoryMovementRecord,
  InventoryMovementPage,
} from "@/services/inventory.service";
import type { InventoryMovementType } from "@/db/types";
import { productSchema } from "@/features/products/types/product";

export type InventoryProduct = InventoryRecord;
export type Movement = Omit<InventoryMovementRecord, "createdAt"> & { createdAt: string };
export type MovementPage = Omit<InventoryMovementPage, "movements"> & { movements: Movement[] };
export const inventoryProductSchema = productSchema
  .pick({ id: true, name: true, sku: true, priceCents: true, stock: true })
  .extend({
    availability: z.enum(["in_stock", "out_of_stock"]),
  })
  .refine(
    (product) => product.availability === (product.stock > 0 ? "in_stock" : "out_of_stock"),
    "Inventory availability is inconsistent.",
  ) satisfies z.ZodType<InventoryProduct>;
export const inventorySchema = z.array(inventoryProductSchema);
const movementTypes = [
  "ORDER_PLACED",
  "ORDER_CANCELLED",
] as const satisfies readonly InventoryMovementType[];
export const movementSchema = z.object({
  id: z.number().int().positive(),
  productId: z.number().int().positive(),
  orderId: z.number().int().positive(),
  orderReference: z.string(),
  type: z.enum(movementTypes),
  quantity: z.number().int().positive(),
  createdAt: z.iso.datetime(),
}) satisfies z.ZodType<Movement>;
export const movementPageSchema = z
  .object({
    product: inventoryProductSchema,
    movements: z.array(movementSchema),
    pagination: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive().max(100),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    }),
  })
  .superRefine(({ movements, pagination, product }, context) => {
    if (
      movements.length > pagination.limit ||
      pagination.totalPages !== Math.ceil(pagination.total / pagination.limit) ||
      movements.some((movement) => movement.productId !== product.id)
    )
      context.addIssue({ code: "custom", message: "Inventory history is inconsistent." });
  }) satisfies z.ZodType<MovementPage>;

export type InventoryStockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type InventoryFilter = "all" | InventoryStockStatus;
export function inventoryStockStatus(stock: number, threshold: number): InventoryStockStatus {
  return stock === 0 ? "out_of_stock" : stock <= threshold ? "low_stock" : "in_stock";
}
export function filterInventory(
  products: InventoryProduct[],
  status: InventoryFilter,
  threshold: number,
) {
  return status === "all"
    ? products
    : products.filter((product) => inventoryStockStatus(product.stock, threshold) === status);
}
