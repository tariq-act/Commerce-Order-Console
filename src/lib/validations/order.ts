import { z } from "zod";
import { productIdParamsSchema } from "./product";

const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const createOrderSchema = z.strictObject({
  items: z.array(z.strictObject({
    productId: z.union([positiveInteger, productIdParamsSchema.shape.id]),
    quantity: positiveInteger,
  })).min(1),
}).superRefine(({ items }, context) => {
  const seen = new Set<number>();
  items.forEach((item, index) => {
    if (seen.has(item.productId)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "productId"],
        message: "Duplicate product IDs are not allowed.",
      });
    }
    seen.add(item.productId);
  });
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
