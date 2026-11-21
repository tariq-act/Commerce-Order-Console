import { z } from "zod";

export const productQuerySchema = z.strictObject({
  search: z.string().trim().min(1).max(200).optional(),
  stock: z.enum(["in_stock", "out_of_stock"]).optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

export function validateProductQuery(parameters: URLSearchParams) {
  const input: Record<string, string | string[]> = Object.create(null);
  for (const key of new Set(parameters.keys())) {
    const values = parameters.getAll(key);
    // Preserve repeated values so Zod rejects ambiguous query parameters.
    input[key] = values.length === 1 ? values[0] : values;
  }
  return productQuerySchema.safeParse(input);
}

export const productIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "Product ID must contain only decimal digits.")
    .transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)),
});
