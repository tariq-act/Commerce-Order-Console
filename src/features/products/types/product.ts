import { z } from "zod";

// JSON contract from GET /api/products and GET /api/products/[id].
export const productSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  sku: z.string(),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const productsSchema = z.array(productSchema);
export type CatalogueProduct = z.infer<typeof productSchema>;
