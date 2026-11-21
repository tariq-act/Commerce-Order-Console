"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiClientError } from "@/lib/api-client";
import type { ProductQuery } from "@/lib/validations/product";
import { productsApiPath } from "../catalogue-params";
import { productSchema, productsSchema } from "../types/product";

const retry = (count: number, error: Error) =>
  !(error instanceof ApiClientError && error.status !== undefined && error.status < 500) &&
  count < 1;
export function useProducts(filters: ProductQuery | undefined) {
  return useQuery({
    queryKey: ["products", "list", filters],
    queryFn: ({ signal }) => {
      if (!filters) throw new Error("Product filters are invalid.");
      return apiGet(productsApiPath(filters), productsSchema, signal);
    },
    enabled: filters !== undefined,
    retry,
  });
}
export function useProduct(id: number | null) {
  return useQuery({
    queryKey: ["products", "detail", id],
    queryFn: ({ signal }) => apiGet(`/api/products/${id}`, productSchema, signal),
    enabled: id !== null,
    retry,
  });
}
