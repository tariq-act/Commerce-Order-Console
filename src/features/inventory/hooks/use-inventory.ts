"use client";

import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { apiGet, ApiClientError } from "@/lib/api-client";
import type { ProductQuery } from "@/lib/validations/product";
import type { PaginationQuery } from "@/lib/validations/pagination";
import { productsApiPath } from "@/features/products/catalogue-params";
import {
  inventoryProductSchema,
  inventorySchema,
  movementPageSchema,
  type InventoryProduct,
} from "../types/inventory";

const retry = (count: number, error: Error) =>
  !(error instanceof ApiClientError && error.status !== undefined && error.status < 500) &&
  count < 1;
export function inventoryApiPath(filters: ProductQuery) {
  return productsApiPath(filters).replace("/api/products", "/api/inventory");
}
export function movementQueryOptions(id: number | null, pagination: PaginationQuery) {
  return queryOptions({
    queryKey: ["inventory", "movements", id, pagination],
    enabled: id !== null,
    queryFn: ({ signal }) =>
      apiGet(
        `/api/inventory/${id}/movements?page=${pagination.page}&limit=${pagination.limit}`,
        movementPageSchema,
        signal,
      ),
    retry,
  });
}
export function useInventory(filters: ProductQuery | undefined) {
  return useQuery({
    queryKey: ["inventory", "list", filters],
    enabled: filters !== undefined,
    queryFn: ({ signal }) => {
      if (!filters) throw new Error("Inventory filters are invalid.");
      return apiGet(inventoryApiPath(filters), inventorySchema, signal);
    },
    retry,
  });
}
export function useInventoryProduct(id: number | null) {
  return useQuery({
    queryKey: ["inventory", "detail", id],
    enabled: id !== null,
    queryFn: ({ signal }) => apiGet(`/api/inventory/${id}`, inventoryProductSchema, signal),
    retry,
  });
}
export function useLatestMovements(products: InventoryProduct[]) {
  return useQueries({
    queries: products.map((product) => ({
      ...movementQueryOptions(product.id, { page: 1, limit: 1 }),
      select: (data: import("../types/inventory").MovementPage) => data.movements[0] ?? null,
    })),
  });
}
