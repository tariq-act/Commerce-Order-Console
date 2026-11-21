"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  parseCatalogueFilters,
  parseSelectedProduct,
  updateCatalogueUrl,
  type StockFilter,
} from "../catalogue-params";

export function useCatalogueFilters() {
  const parameters = useSearchParams();
  const search = parameters.get("search")?.trim() ?? "";
  const [draft, setDraft] = useState(search);
  const validation = parseCatalogueFilters(parameters);
  const selection = parseSelectedProduct(parameters);
  const stockValue = parameters.get("stock");
  const stock: StockFilter =
    stockValue === "in_stock" || stockValue === "out_of_stock" ? stockValue : "all";

  useEffect(() => {
    setDraft(search);
  }, [search]);
  useEffect(() => {
    if (draft.trim() === search) return;
    const timer = setTimeout(() => updateCatalogueUrl({ search: draft.trim() || null }), 300);
    return () => clearTimeout(timer);
  }, [draft, search]);

  function clearFilters() {
    setDraft("");
    updateCatalogueUrl({ search: null, stock: null });
  }
  return {
    draft,
    setDraft,
    stock,
    validation,
    selection,
    isDebouncing: draft.trim() !== search,
    hasFilters: parameters.has("search") || parameters.has("stock") || draft.length > 0,
    setStock: (value: StockFilter) =>
      updateCatalogueUrl({ stock: value === "all" ? null : value }, "push"),
    clearSearch: () => {
      setDraft("");
      updateCatalogueUrl({ search: null });
    },
    clearFilters,
  };
}
