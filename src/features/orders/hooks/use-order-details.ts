"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, ApiClientError } from "@/lib/api-client";
import {
  orderDetailsSchema,
  type OrderDetailsResponse,
  type UpdatedOrderResponse,
} from "../types/order";
import {
  canChangeOrderStatus,
  orderActionError,
  submitOrderAction,
  type OrderAction,
} from "../actions";

// The list's item counts use this same detail cache and full response shape.
export function useOrderDetails(id: number | null) {
  return useQuery({
    queryKey: ["orders", "detail", id],
    enabled: id !== null,
    queryFn: ({ signal }) => apiGet(`/api/orders/${id}`, orderDetailsSchema, signal),
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.status !== undefined && error.status < 500) &&
      count < 1,
  });
}

export function refreshOrderCaches(client: QueryClient) {
  for (const key of ["orders", "products", "inventory", "dashboard"])
    void client.invalidateQueries({ queryKey: [key] }).catch(() => {});
}

export function cacheUpdatedOrder(client: QueryClient, updated: UpdatedOrderResponse) {
  client.setQueryData<OrderDetailsResponse>(["orders", "detail", updated.id], (current) =>
    current ? { ...current, ...updated } : undefined,
  );
}

export function useOrderActions(order: OrderDetailsResponse | undefined) {
  const client = useQueryClient();
  const pending = useRef(false);
  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: OrderAction }) =>
      submitOrderAction(id, action),
    retry: false,
    networkMode: "always",
    onMutate: ({ id }) => client.cancelQueries({ queryKey: ["orders", "detail", id] }),
    onSuccess: (updated) => {
      cacheUpdatedOrder(client, updated);
      toast.success(
        updated.status === "CANCELLED"
          ? "Order cancelled · inventory restored"
          : updated.status === "PACKED"
            ? "Order marked as packed"
            : "Order marked as shipped",
      );
    },
    onError: (error) => {
      toast.error("Order update failed", { description: orderActionError(error) });
    },
    onSettled: () => refreshOrderCaches(client),
  });
  async function submit(action: OrderAction) {
    if (pending.current || !order || !canChangeOrderStatus(order.status, action)) return false;
    pending.current = true;
    try {
      await mutation.mutateAsync({ id: order.id, action });
      return true;
    } catch {
      return false;
    } finally {
      pending.current = false;
    }
  }
  return { ...mutation, submit };
}
