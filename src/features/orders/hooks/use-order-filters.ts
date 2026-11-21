"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parseOrderFilters, updateOrdersUrl } from "../list-params";
import { orderStatusSchema } from "../types/order";
import type { OrderStatus } from "@/db/types";

export function useOrderFilters() {
  const parameters = useSearchParams();
  const search = parameters.get("search")?.trim() ?? "";
  const [draft, setDraft] = useState(search);
  const validation = parseOrderFilters(parameters);
  const parsedStatus = orderStatusSchema.safeParse(parameters.get("status"));
  const status: OrderStatus | "all" = parsedStatus.success ? parsedStatus.data : "all";
  useEffect(() => {
    setDraft(search);
  }, [search]);
  useEffect(() => {
    if (draft.trim() === search) return;
    const timer = setTimeout(() => updateOrdersUrl({ search: draft.trim() || null }), 300);
    return () => clearTimeout(timer);
  }, [draft, search]);
  return {
    draft,
    setDraft,
    validation,
    status,
    isDebouncing: draft.trim() !== search,
    hasFilters: parameters.has("search") || parameters.has("status") || draft.length > 0,
    clearSearch: () => {
      setDraft("");
      updateOrdersUrl({ search: null });
    },
    clearFilters: () => {
      setDraft("");
      updateOrdersUrl({
        search: null,
        status: null,
        page: null,
        ...(!validation.success ? { limit: null } : {}),
      });
    },
    setStatus: (value: OrderStatus | "all") =>
      updateOrdersUrl({ status: value === "all" ? null : value }, "push"),
    setPage: (value: number) =>
      updateOrdersUrl({ page: value === 1 ? null : String(value) }, "push"),
    setLimit: (value: number) => updateOrdersUrl({ limit: String(value) }, "push"),
  };
}
