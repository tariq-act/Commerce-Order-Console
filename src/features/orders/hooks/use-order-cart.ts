"use client";

import { useState } from "react";
import type { CatalogueProduct } from "@/features/products/types/product";
import { addProduct, cartTotals, resolveCart, setQuantity, type CartEntry } from "../cart";

export function useOrderCart(catalog: CatalogueProduct[] | undefined) {
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const items = resolveCart(entries, catalog);
  return {
    items,
    totals: cartTotals(items),
    hasUnavailable: items.some((item) => item.missing || item.quantity > item.product.stock),
    add: (product: CatalogueProduct) => setEntries((current) => addProduct(current, product)),
    setQuantity: (product: CatalogueProduct, quantity: number) =>
      setEntries((current) => setQuantity(current, product, quantity)),
    remove: (id: number) =>
      setEntries((current) => current.filter((item) => item.product.id !== id)),
    clear: () => setEntries([]),
  };
}
