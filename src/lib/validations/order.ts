import { z } from "zod";
import { productIdParamsSchema } from "./product";
import { orderStatuses } from "../../db/schema/orders";
import { queryParametersToObject } from "./query";

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

const positiveQueryInteger = z
  .string()
  .regex(/^\d+$/, "Must contain only decimal digits.")
  .transform(Number)
  .pipe(positiveInteger);

export const orderQuerySchema = z
  .strictObject({
    search: z.string().trim().min(1).max(200).optional(),
    status: z.enum(orderStatuses).optional(),
    page: positiveQueryInteger.default(1),
    limit: positiveQueryInteger.pipe(z.number().max(100)).default(20),
  })
  .superRefine(({ page, limit }, context) => {
    if (!Number.isSafeInteger((page - 1) * limit)) {
      context.addIssue({
        code: "custom",
        path: ["page"],
        message: "Pagination offset exceeds the supported integer range.",
      });
    }
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
