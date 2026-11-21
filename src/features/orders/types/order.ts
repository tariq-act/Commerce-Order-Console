import { z } from "zod";
import type { CreateOrderInput } from "@/lib/validations/order";

export type CreateOrderRequest = CreateOrderInput;
const integer = z.number().int().nonnegative();
const positive = z.number().int().positive();
export const createdOrderSchema = z
  .object({
    id: positive,
    reference: z.string().min(1),
    status: z.literal("PLACED"),
    items: z
      .array(
        z.object({
          productId: positive,
          productName: z.string(),
          quantity: positive,
          unitPriceCents: integer,
        }),
      )
      .min(1),
    totalCents: integer,
    createdAt: z.iso.datetime(),
  })
  .superRefine((order, context) => {
    const total = order.items.reduce(
      (sum, item) => sum + BigInt(item.unitPriceCents) * BigInt(item.quantity),
      BigInt(0),
    );
    if (total !== BigInt(order.totalCents))
      context.addIssue({ code: "custom", message: "Order totals are inconsistent." });
    if (new Set(order.items.map((item) => item.productId)).size !== order.items.length)
      context.addIssue({ code: "custom", message: "Order items are duplicated." });
  });
export type CreatedOrderResponse = z.infer<typeof createdOrderSchema>;
