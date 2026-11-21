"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, ApiClientError } from "@/lib/api-client";
import { createdOrderSchema, type CreateOrderRequest } from "../types/order";

export function orderErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.outcomeUnknown)
      return "We couldn’t confirm whether the order was placed. Your cart is kept on this page. Check all orders before trying again.";
    if (error.status === 409)
      return error.code === "INVENTORY_CONFLICT"
        ? "Inventory is busy or has changed. Your cart is unchanged. Refresh availability and try again."
        : "There isn’t enough stock for this order anymore. Your cart is unchanged. Review the updated availability and adjust quantities.";
    if (error.status === 404)
      return "A product is no longer available. Your cart is unchanged. Remove unavailable products before trying again.";
    if (error.status === 400)
      return "The order could not be accepted. Review quantities and the cart total, then try again. Your cart is unchanged.";
  }
  return "The order could not be created because of a server error. Your cart is unchanged. Please try again.";
}

export function useCreateOrder() {
  const client = useQueryClient();
  const pending = useRef(false);
  const mutation = useMutation({
    mutationFn: (payload: CreateOrderRequest) =>
      apiPost("/api/orders", payload, createdOrderSchema),
    retry: false,
    networkMode: "always",
    onSuccess: () => {
      // Refetch failures must never turn a confirmed placement into a failed one.
      for (const key of ["products", "orders", "inventory", "dashboard"])
        void client.invalidateQueries({ queryKey: [key] }).catch(() => {});
    },
    onError: (error) => {
      if (
        error instanceof ApiClientError &&
        (error.status === 409 || error.status === 404 || error.outcomeUnknown)
      ) {
        void client.invalidateQueries({ queryKey: ["products"] }).catch(() => {});
      }
    },
  });
  async function submit(payload: CreateOrderRequest) {
    // This guard is synchronous, including two clicks before React rerenders.
    if (pending.current) return undefined;
    pending.current = true;
    try {
      return await mutation.mutateAsync(payload);
    } finally {
      pending.current = false;
    }
  }
  return { ...mutation, submit, isSubmitting: () => pending.current };
}
