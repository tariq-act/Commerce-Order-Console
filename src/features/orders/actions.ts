import type { OrderStatus } from "@/db/types";
import { apiPatch, apiPost, ApiClientError } from "@/lib/api-client";
import { updatedOrderSchema } from "./types/order";

export type OrderAction = Extract<OrderStatus, "PACKED" | "SHIPPED" | "CANCELLED">;
export function canChangeOrderStatus(status: OrderStatus, action: OrderAction) {
  return (
    (status === "PLACED" && action === "PACKED") ||
    (status === "PACKED" && action === "SHIPPED") ||
    ((status === "PLACED" || status === "PACKED") && action === "CANCELLED")
  );
}
export function submitOrderAction(id: number, action: OrderAction) {
  return action === "CANCELLED"
    ? apiPost(`/api/orders/${id}/cancel`, undefined, updatedOrderSchema)
    : apiPatch(`/api/orders/${id}/status`, { status: action }, updatedOrderSchema);
}
export function orderActionError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.outcomeUnknown)
      return "We couldn’t confirm the update. Refresh the order to check its status before trying again.";
    if (error.status === 409)
      return error.code === "INVENTORY_CONFLICT"
        ? "The order or inventory is busy. Refresh the order and try again."
        : "This action is no longer available for the order’s current status. Refresh and review the order.";
    if (error.status === 404) return "This order could not be found. Return to all orders.";
    if (error.status === 400)
      return "The status update was not accepted. Refresh the order and try again.";
  }
  return "The order could not be updated. Please refresh and try again.";
}
