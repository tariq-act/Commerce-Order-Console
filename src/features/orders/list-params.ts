import { z } from "zod";
import type { OrderQuery } from "@/lib/validations/order";
import { paginationQuerySchema } from "@/lib/validations/pagination";
import { orderStatusSchema } from "./types/order";

const filtersSchema = paginationQuerySchema.safeExtend({
  search: z.string().trim().min(1).max(200).optional(),
  status: orderStatusSchema.optional(),
});
export function parseOrderFilters(parameters: Pick<URLSearchParams, "getAll">) {
  const input: Record<string, string | string[]> = {};
  for (const key of ["search", "status", "page", "limit"]) {
    const values = parameters.getAll(key);
    if (values.length === 0) continue;
    if (key === "search" && values.length === 1 && !values[0].trim()) continue;
    input[key] = values.length === 1 ? values[0] : values;
  }
  return filtersSchema.safeParse(input);
}
export function ordersApiPath(filters: OrderQuery) {
  const parameters = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.search) parameters.set("search", filters.search);
  if (filters.status) parameters.set("status", filters.status);
  return `/api/orders?${parameters}`;
}
type Updates = Partial<Record<"search" | "status" | "page" | "limit", string | null>>;
export function orderListHref(current: URL, updates: Updates) {
  const url = new URL(current);
  for (const [key, value] of Object.entries(updates)) {
    if (!value) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  if ("search" in updates || "status" in updates || "limit" in updates)
    url.searchParams.delete("page");
  return `${url.pathname}${url.search}${url.hash}`;
}
export function updateOrdersUrl(updates: Updates, mode: "push" | "replace" = "replace") {
  // Read the current URL when the action runs; delayed search must preserve
  // a status or page-size change made while its timer was pending.
  const href = orderListHref(new URL(window.location.href), updates);
  if (mode === "push") window.history.pushState(null, "", href);
  else window.history.replaceState(null, "", href);
}
