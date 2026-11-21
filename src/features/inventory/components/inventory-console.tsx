"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Package, RefreshCw, SearchX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductSearch } from "@/features/products/components/product-search";
import { ProductsSkeleton } from "@/features/products/components/products-skeleton";
import { ProductError } from "@/features/products/components/product-error";
import { productQuerySchema } from "@/lib/validations/product";
import { formatNumber } from "@/lib/format";
import { useInventory } from "../hooks/use-inventory";
import { filterInventory, type InventoryFilter } from "../types/inventory";
import { InventoryTable } from "./inventory-table";
import { InventoryHistory } from "./inventory-history";

export function InventoryConsole({ threshold }: { threshold: number }) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState<InventoryFilter>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const client = useQueryClient();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft]);
  const validation = productQuerySchema.safeParse({
    search: search || undefined,
    stock: stock === "all" ? undefined : stock === "out_of_stock" ? "out_of_stock" : "in_stock",
  });
  const query = useInventory(validation.success ? validation.data : undefined);
  const loading = query.isPending || draft.trim() !== search;
  const products = filterInventory(query.data ?? [], stock, threshold);
  const filtered = draft.trim() !== "" || stock !== "all";
  useEffect(() => {
    if (query.isError)
      toast.error("Inventory couldn’t be loaded", {
        id: "inventory-error",
        description: "Please try again to load current stock.",
      });
    else if (query.isSuccess) toast.dismiss("inventory-error");
  }, [query.isError, query.isSuccess, query.errorUpdatedAt]);
  function clearSearch() {
    setDraft("");
    setSearch("");
  }
  function reset() {
    clearSearch();
    setStock("all");
  }
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Know what’s available, and what changed."
        action={
          <Button
            variant="outline"
            disabled={query.isFetching || !validation.success}
            onClick={() => {
              void client.invalidateQueries({ queryKey: ["inventory"] });
            }}
          >
            <RefreshCw
              className={query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}
              aria-hidden="true"
            />
            {query.isFetching ? "Refreshing" : "Refresh"}
          </Button>
        }
      />
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Stock overview</CardTitle>
          <CardDescription>
            Current stock and the latest recorded movement for every product.
          </CardDescription>
        </CardHeader>
        <div
          role="search"
          aria-label="Filter inventory"
          className="flex flex-col gap-3 border-b border-border px-5 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:px-6"
        >
          <ProductSearch
            value={draft}
            onChange={setDraft}
            onClear={clearSearch}
            inputRef={inputRef}
          />
          <div className="flex items-center gap-2 sm:ml-auto">
            <Select
              value={stock}
              onValueChange={(value) => {
                if (
                  value === "all" ||
                  value === "in_stock" ||
                  value === "low_stock" ||
                  value === "out_of_stock"
                )
                  setStock(value);
              }}
            >
              <SelectTrigger aria-label="Filter inventory stock status" className="min-w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock statuses</SelectItem>
                <SelectItem value="in_stock">In stock</SelectItem>
                <SelectItem value="low_stock">Low stock</SelectItem>
                <SelectItem value="out_of_stock">Out of stock</SelectItem>
              </SelectContent>
            </Select>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={reset}>
                Reset
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-3 text-xs text-muted-foreground">
          <p role="status">
            {!validation.success
              ? "Filters need attention"
              : loading
                ? "Loading current inventory…"
                : query.isError
                  ? "Inventory unavailable"
                  : `${formatNumber(products.length)} ${products.length === 1 ? "product" : "products"}`}
          </p>
          <p>
            {threshold === 0
              ? "Low stock alerts disabled"
              : `Low stock: 1–${formatNumber(threshold)} units`}
          </p>
        </div>
        {!validation.success ? (
          <ProductError
            title="Check your search"
            description="Use a product name or SKU of up to 200 characters."
            onRetry={reset}
          />
        ) : loading ? (
          <ProductsSkeleton />
        ) : query.isError ? (
          <ProductError
            title="Inventory is unavailable"
            description="We couldn’t load current inventory. Please try again."
            onRetry={() => {
              void query.refetch();
            }}
            retrying={query.isFetching}
          />
        ) : products.length > 0 ? (
          <InventoryTable
            products={products}
            threshold={threshold}
            onView={(id, element) => {
              trigger.current = element;
              setSelected(id);
            }}
          />
        ) : (
          <EmptyState
            icon={filtered ? SearchX : Package}
            title={filtered ? "No inventory matches your filters" : "No inventory yet"}
            description={
              filtered
                ? "Try another name, SKU or stock status."
                : "Products will appear here once they’re available in the catalogue."
            }
            action={
              filtered ? (
                <Button variant="outline" onClick={reset}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
        <p className="border-t border-border px-6 py-4 text-xs leading-5 text-muted-foreground">
          Order placement deducts stock. Cancellation restores it. Viewing inventory never changes
          stock.
        </p>
      </Card>
      <InventoryHistory
        key={selected ?? "closed"}
        selected={selected !== null}
        id={selected}
        threshold={threshold}
        onClose={() => setSelected(null)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (trigger.current?.isConnected) trigger.current.focus();
          else inputRef.current?.focus();
        }}
      />
    </>
  );
}
