import { z } from "zod";
import { queryParametersToObject } from "./query";

export const productQuerySchema = z.strictObject({
  search: z.string().trim().min(1).max(200).optional(),
  stock: z.enum(["in_stock", "out_of_stock"]).optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

export function validateProductQuery(parameters: URLSearchParams) {
  return productQuerySchema.safeParse(queryParametersToObject(parameters));
}

export const productIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "Product ID must contain only decimal digits.")
    .transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)),
});
