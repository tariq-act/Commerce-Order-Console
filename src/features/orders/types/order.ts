import { z } from "zod";
import type { OrderStatus } from "@/db/types";
import type { OrderSummary, OrderDetails, OrderPage } from "@/services/order-query.service";
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

export const orderStatusValues = [
  "PLACED",
  "PACKED",
  "SHIPPED",
  "CANCELLED",
] as const satisfies readonly OrderStatus[];
export const orderStatusSchema = z.enum(orderStatusValues);
type WithJsonDate<T extends { createdAt: Date }> = Omit<T, "createdAt"> & { createdAt: string };
export type OrderSummaryResponse = WithJsonDate<OrderSummary>;
export type OrderDetailsResponse = WithJsonDate<OrderDetails>;
export type OrderPageResponse = Omit<OrderPage, "orders"> & { orders: OrderSummaryResponse[] };

export const orderSummarySchema = z.object({
  id: positive,
  reference: z.string().min(1),
  status: orderStatusSchema,
  totalCents: integer,
  createdAt: z.iso.datetime(),
}) satisfies z.ZodType<OrderSummaryResponse>;
export const orderDetailsSchema = orderSummarySchema.extend({
  items: z.array(
    z.object({
      id: positive,
      productId: positive,
      productName: z.string(),
      sku: z.string(),
      quantity: positive,
      unitPriceCents: integer,
      subtotalCents: integer,
    }),
  ),
}) satisfies z.ZodType<OrderDetailsResponse>;
export const orderPageSchema = z
  .object({
    orders: z.array(orderSummarySchema),
    pagination: z.object({
      page: positive,
      limit: positive.max(100),
      total: integer,
      totalPages: integer,
    }),
  })
  .superRefine(({ orders, pagination }, context) => {
    if (
      orders.length > pagination.limit ||
      pagination.totalPages !== Math.ceil(pagination.total / pagination.limit)
    ) {
      context.addIssue({ code: "custom", message: "Order pagination is inconsistent." });
    }
  }) satisfies z.ZodType<OrderPageResponse>;

export function orderItemCount(order: Pick<OrderDetailsResponse, "items">): number {
  const units = order.items.reduce((total, item) => total + BigInt(item.quantity), BigInt(0));
  if (units > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Item count exceeds the supported integer range.");
  return Number(units);
}
