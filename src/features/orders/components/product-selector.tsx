"use client";

import { useEffect, useRef, useState } from "react";
import { Package, Plus, SearchX } from "lucide-react";
import { useProducts } from "@/features/products/hooks/use-products";
import type { CatalogueProduct } from "@/features/products/types/product";
import { ProductSearch } from "@/features/products/components/product-search";
import { ProductStatusBadge } from "@/features/products/components/product-status-badge";
import { ProductError } from "@/features/products/components/product-error";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber } from "@/lib/format";

export function ProductSelector({
  quantities,
  onAdd,
  locked,
}: {
  quantities: Map<number, number>;
  onAdd: (product: CatalogueProduct) => void;
  locked: boolean;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useProducts(debounced ? { search: debounced } : {});
  const loading = search.trim() !== debounced || query.isPending;
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>Choose products</CardTitle>
        <CardDescription>Find the right products and add them to your order.</CardDescription>
      </CardHeader>
      <div className="border-b border-border px-5 pb-5 sm:px-6">
        <ProductSearch
          value={search}
          onChange={setSearch}
          onClear={() => {
            setSearch("");
            setDebounced("");
          }}
          inputRef={inputRef}
        />
      </div>
      {loading ? (
        <div role="status" aria-label="Loading order products" className="space-y-6 p-6">
          <span className="sr-only">Loading available products.</span>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="size-11 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-9 w-20" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <ProductError
          title="Products are unavailable"
          description="We couldn’t load the product catalogue. Your cart is kept while you try again."
          retrying={query.isFetching}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={search ? SearchX : Package}
          title={search ? "No matching products" : "No products available"}
          description={
            search
              ? "Try another product name or SKU."
              : "Products will appear here when they’re available in the catalogue."
          }
          className="py-14 sm:py-16"
          action={
            search ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setDebounced("");
                }}
              >
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul
          aria-label="Products to order"
          className="divide-y divide-border xl:max-h-[660px] xl:overflow-y-auto"
        >
          {query.data.map((product) => {
            const quantity = quantities.get(product.id) ?? 0;
            const limit = quantity >= product.stock;
            return (
              <li key={product.id} className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/35 text-muted-foreground sm:flex">
                    <Package className="size-5" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium leading-6 break-words">{product.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground break-all">{product.sku}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(product.priceCents)}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProductStatusBadge stock={product.stock} />
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(product.stock)} available
                    </span>
                    {quantity > 0 && (
                      <Badge
                        variant="outline"
                        className="border-violet-200 bg-violet-50 text-primary"
                      >
                        {formatNumber(quantity)} in cart
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked || limit}
                    aria-label={`Add ${product.name} to cart`}
                    onClick={() => onAdd(product)}
                  >
                    <Plus aria-hidden="true" />
                    {product.stock === 0 ? "Unavailable" : limit ? "Limit reached" : "Add"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-border px-6 py-4 text-xs leading-5 text-muted-foreground">
        Availability is checked again when you place the order.
      </p>
    </Card>
  );
}
