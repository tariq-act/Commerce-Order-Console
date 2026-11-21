"use client";

import { Package, RefreshCw } from "lucide-react";
import type { ComponentProps } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError } from "@/lib/api-client";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { useProduct } from "../hooks/use-products";
import type { CatalogueProduct } from "../types/product";
import { ProductStatusBadge } from "./product-status-badge";
import { ProductError } from "./product-error";

export function ProductInformation({ product }: { product: CatalogueProduct }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/45">
          <Package className="size-7 text-[#76728b]" strokeWidth={1.4} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-lg leading-6 font-semibold tracking-tight break-words">
            {product.name}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground break-all">{product.sku}</p>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Description
        </h3>
        <p className="text-sm leading-6 whitespace-pre-wrap break-words">
          {product.description || "No description provided."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/25 p-5">
        <div className="min-w-0">
          <h3 className="text-xs font-medium text-muted-foreground">Price · INR</h3>
          <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums break-words">
            {formatCurrency(product.priceCents)}
          </p>
        </div>
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Available inventory</h3>
          <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums">
            {formatNumber(product.stock)}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">units</span>
          </p>
        </div>
      </div>
      <dl className="divide-y divide-border text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <dt className="text-muted-foreground">Availability</dt>
          <dd>
            <ProductStatusBadge stock={product.stock} />
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-3 py-4">
          <dt className="text-muted-foreground">Created · IST</dt>
          <dd>
            <time dateTime={product.createdAt}>{formatDate(product.createdAt)}</time>
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-3 pt-4">
          <dt className="text-muted-foreground">Last updated · IST</dt>
          <dd>
            <time dateTime={product.updatedAt}>{formatDate(product.updatedAt)}</time>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ProductDetails({
  selected,
  id,
  onClose,
  onCloseAutoFocus,
}: {
  selected: boolean;
  id: number | null;
  onClose: () => void;
  onCloseAutoFocus: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
}) {
  const query = useProduct(id);
  const missing = query.error instanceof ApiClientError && query.error.status === 404;
  return (
    <Dialog
      open={selected}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Product details</DialogTitle>
          <DialogDescription>Product information and current inventory.</DialogDescription>
        </DialogHeader>
        {id === null ? (
          <ProductError
            title="Invalid product selection"
            description="This link does not contain a valid product ID. Close this view and choose a product from the catalogue."
          />
        ) : query.isPending ? (
          <div role="status" aria-label="Loading product details" className="space-y-6">
            <Skeleton className="h-14 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
            <span className="sr-only">Loading product details.</span>
          </div>
        ) : query.isError ? (
          <ProductError
            title={missing ? "Product not found" : "Product details are unavailable"}
            description={
              missing
                ? "This product could not be found. Close this view and select another product."
                : "We couldn’t load current product information. Please try again."
            }
            retrying={query.isFetching}
            onRetry={
              missing
                ? undefined
                : () => {
                    void query.refetch();
                  }
            }
          />
        ) : (
          <>
            <ProductInformation product={query.data} />
            <div className="mt-7 border-t border-border pt-5">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  void query.refetch();
                }}
                disabled={query.isFetching}
              >
                <RefreshCw
                  className={query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}
                  aria-hidden="true"
                />
                {query.isFetching ? "Refreshing details" : "Refresh details"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
