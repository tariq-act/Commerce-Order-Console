"use client";

import { useEffect, useRef } from "react";
import { Package, RefreshCw, SearchX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { updateCatalogueUrl } from "../catalogue-params";
import { useCatalogueFilters } from "../hooks/use-catalogue-filters";
import { useProducts } from "../hooks/use-products";
import { ProductFilters } from "./product-filters";
import { ProductTable } from "./product-table";
import { ProductDetails } from "./product-details";
import { ProductsSkeleton } from "./products-skeleton";
import { ProductError } from "./product-error";

export function ProductCatalogue() {
  const filters = useCatalogueFilters();
  const query = useProducts(filters.validation.success ? filters.validation.data : undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const loading = filters.isDebouncing || query.isPending;
  const visible = filters.validation.success && !loading && !query.isError;
  useEffect(() => {
    if (query.isError)
      toast.error("Products couldn’t be loaded", {
        id: "products-error",
        description: "Please try again to load the current catalogue.",
      });
    else if (query.isSuccess) toast.dismiss("products-error");
  }, [query.isError, query.isSuccess, query.errorUpdatedAt]);

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue, with every detail in reach."
        action={
          <Button
            variant="outline"
            disabled={query.isFetching || !filters.validation.success}
            onClick={() => {
              void query.refetch();
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
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Product catalogue</CardTitle>
            <CardDescription className="mt-1">
              Browse your products and check their availability.
            </CardDescription>
          </div>
          <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground sm:flex">
            <Package className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </span>
        </CardHeader>
        <ProductFilters
          search={filters.draft}
          onSearch={filters.setDraft}
          onClearSearch={filters.clearSearch}
          stock={filters.stock}
          onStock={filters.setStock}
          hasFilters={filters.hasFilters}
          onClear={filters.clearFilters}
          inputRef={inputRef}
        />
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-3 text-[0.8125rem]">
          <span role="status" className="flex items-center gap-2 text-muted-foreground">
            {!filters.validation.success ? (
              "Filters need attention"
            ) : loading ? (
              "Searching your catalogue…"
            ) : query.isError ? (
              "Products unavailable"
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {formatNumber(query.data?.length ?? 0)}
                </span>
                {query.data?.length === 1 ? "product" : "products"}
                {filters.hasFilters ? " found" : " in your catalogue"}
              </>
            )}
          </span>
          <Badge variant="outline">
            {filters.stock === "in_stock"
              ? "In stock"
              : filters.stock === "out_of_stock"
                ? "Out of stock"
                : "All products"}
          </Badge>
        </div>
        {!filters.validation.success ? (
          <div className="px-6 py-12 text-center" role="alert">
            <h2 className="text-lg font-semibold">Check your product filters</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use a search of up to 200 characters and one valid stock filter.
            </p>
            <Button variant="outline" className="mt-5" onClick={filters.clearFilters}>
              Reset filters
            </Button>
          </div>
        ) : loading ? (
          <ProductsSkeleton />
        ) : query.isError ? (
          <ProductError
            title="Products are unavailable"
            description="We couldn’t load the latest catalogue. Please try again."
            onRetry={() => {
              void query.refetch();
            }}
            retrying={query.isFetching}
          />
        ) : visible && query.data && query.data.length > 0 ? (
          <ProductTable
            products={query.data}
            onView={(id, trigger) => {
              detailTrigger.current = trigger;
              updateCatalogueUrl({ product: String(id) }, "push");
            }}
          />
        ) : (
          <EmptyState
            icon={filters.hasFilters ? SearchX : Package}
            title={filters.hasFilters ? "No products match your search" : "Your catalogue is empty"}
            description={
              filters.hasFilters
                ? "Try a different name or SKU, or clear your filters to see every product."
                : "Products will appear here once they’re available in the catalogue."
            }
            action={
              filters.hasFilters ? (
                <Button variant="outline" onClick={filters.clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
        <div className="border-t border-border px-6 py-4 text-xs leading-5 text-muted-foreground">
          Prices are shown in INR. Stock reflects the latest available product information.
        </div>
      </Card>
      <ProductDetails
        selected={filters.selection.selected}
        id={filters.selection.id}
        onClose={() => updateCatalogueUrl({ product: null })}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (detailTrigger.current?.isConnected) detailTrigger.current.focus();
          else inputRef.current?.focus();
        }}
      />
    </>
  );
}
