"use client";

import { useQueries, useQuery, type QueryFunctionContext } from "@tanstack/react-query";
import { apiGet, ApiClientError } from "@/lib/api-client";
import type { OrderQuery } from "@/lib/validations/order";
import { ordersApiPath } from "../list-params";
import {
  orderDetailsSchema,
  orderItemCount,
  orderPageSchema,
  type OrderSummaryResponse,
} from "../types/order";

const retry = (count: number, error: Error) =>
  !(error instanceof ApiClientError && error.status !== undefined && error.status < 500) &&
  count < 1;
export function useOrders(filters: OrderQuery | undefined) {
  return useQuery({
    queryKey: ["orders", "list", filters],
    enabled: filters !== undefined,
    queryFn: ({ signal }) => {
      if (!filters) throw new Error("Order filters are invalid.");
      return apiGet(ordersApiPath(filters), orderPageSchema, signal);
    },
    retry,
  });
}
export function useOrderItemCounts(orders: OrderSummaryResponse[]) {
  return useQueries({
    queries: orders.map((order) => ({
      queryKey: ["orders", "detail", order.id],
      queryFn: ({ signal }: QueryFunctionContext) =>
        apiGet(`/api/orders/${order.id}`, orderDetailsSchema, signal),
      select: orderItemCount,
      retry,
    })),
  });
}
