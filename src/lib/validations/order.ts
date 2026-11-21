import { z } from "zod";
import { productIdParamsSchema } from "./product";
import { orderStatuses } from "../../db/schema/orders";
import { queryParametersToObject } from "./query";
import { paginationQuerySchema } from "./pagination";

const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const createOrderSchema = z
  .strictObject({
    items: z
      .array(
        z.strictObject({
          productId: z.union([positiveInteger, productIdParamsSchema.shape.id]),
          quantity: positiveInteger,
        }),
      )
      .min(1),
  })
  .superRefine(({ items }, context) => {
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

export const orderQuerySchema = paginationQuerySchema.safeExtend({
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(orderStatuses).optional(),
});

export type OrderQuery = z.infer<typeof orderQuerySchema>;

export function validateOrderQuery(parameters: URLSearchParams) {
  return orderQuerySchema.safeParse(queryParametersToObject(parameters));
}

export const orderIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Order ID must contain only decimal digits.")
    .transform(Number)
    .pipe(positiveInteger),
});

export const updateOrderStatusSchema = z.strictObject({
  status: z.enum(orderStatuses),
});
