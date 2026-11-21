"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  History,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductError } from "@/features/products/components/product-error";
import { ApiClientError } from "@/lib/api-client";
import { formatCurrency, formatDate, formatTime, formatNumber } from "@/lib/format";
import { movementQueryOptions, useInventoryProduct } from "../hooks/use-inventory";
import type { MovementPage } from "../types/inventory";
import { InventoryStockBadge } from "./inventory-stock-badge";

export function MovementHistoryTable({ data }: { data: MovementPage }) {
  return (
    <Table aria-label="Inventory movements" className="min-w-[600px]">
      <TableHeader>
        <TableRow>
          <TableHead>Movement</TableHead>
          <TableHead className="text-right">Quantity changed</TableHead>
          <TableHead>Related order</TableHead>
          <TableHead>Date · IST</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.movements.map((movement) => {
          const placed = movement.type === "ORDER_PLACED";
          const Icon = placed ? ArrowUpRight : ArrowDownLeft;
          return (
            <TableRow key={movement.id}>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    placed
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {placed ? "Order placed" : "Order cancelled"}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {placed ? "−" : "+"}
                {formatNumber(movement.quantity)}
                <span className="sr-only">{placed ? " units deducted" : " units restored"}</span>
              </TableCell>
              <TableCell>
                <Link
                  href={`/orders/${movement.orderId}`}
                  title={movement.orderReference || "View order"}
                  className="block max-w-44 truncate rounded-sm text-xs font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {movement.orderReference || "View order"}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <time dateTime={movement.createdAt} className="text-xs text-muted-foreground">
                  {formatDate(movement.createdAt)}
                  <span className="mt-1 block">{formatTime(movement.createdAt)}</span>
                </time>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function InventoryHistory({
  selected,
  id,
  threshold,
  onClose,
  onCloseAutoFocus,
}: {
  selected: boolean;
  id: number | null;
  threshold: number;
  onClose: () => void;
  onCloseAutoFocus: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
}) {
  const [page, setPage] = useState(1);
  const product = useInventoryProduct(selected ? id : null);
  const history = useQuery(movementQueryOptions(selected ? id : null, { page, limit: 20 }));
  const client = useQueryClient();
  const missing = [product.error, history.error].some(
    (error) => error instanceof ApiClientError && error.status === 404,
  );
  const loading = product.isPending || history.isPending;
  const fetching = product.isFetching || history.isFetching;
  const data = history.data;
  function refresh() {
    void client.invalidateQueries({ queryKey: ["inventory"] });
  }
  return (
    <Dialog
      open={selected}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-4xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Inventory history</DialogTitle>
          <DialogDescription>
            Current inventory and recorded order movements. Newest first.
          </DialogDescription>
        </DialogHeader>
        {id === null ? (
          <ProductError
            title="Invalid product selection"
            description="Close this view and select an existing inventory record."
          />
        ) : product.isError || history.isError ? (
          <ProductError
            title={missing ? "Product not found" : "Inventory history is unavailable"}
            description={
              missing
                ? "This product could not be found. Select another inventory record."
                : "We couldn’t load current inventory and its history. Please try again."
            }
            retrying={fetching}
            onRetry={missing ? undefined : refresh}
          />
        ) : loading ? (
          <div role="status" aria-label="Loading inventory history" className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          product.data &&
          data && (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-muted/25 p-5">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold break-words">{product.data.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {product.data.sku} · {formatCurrency(product.data.priceCents)}
                  </p>
                  <div className="mt-3">
                    <InventoryStockBadge stock={product.data.stock} threshold={threshold} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Current stock</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatNumber(product.data.stock)}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">units</span>
                  </p>
                </div>
              </div>
              {data.movements.length > 0 ? (
                <MovementHistoryTable data={data} />
              ) : (
                <EmptyState
                  className="py-8 sm:py-10"
                  icon={History}
                  title={
                    page > 1 && data.pagination.total > 0
                      ? "No movements on this page"
                      : "No inventory movements yet"
                  }
                  description={
                    page > 1 && data.pagination.total > 0
                      ? "Return to the first page to see recorded movements."
                      : "Order placement and cancellation movements will appear here."
                  }
                  action={
                    page > 1 ? (
                      <Button variant="outline" onClick={() => setPage(1)}>
                        Go to first page
                      </Button>
                    ) : undefined
                  }
                />
              )}
              <nav
                aria-label="Inventory movement pagination"
                className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"
              >
                <p className="text-xs text-muted-foreground" aria-current="page">
                  {formatNumber(data.pagination.total)} movements · Page{" "}
                  {formatNumber(data.pagination.page)}
                  {data.pagination.totalPages > 0
                    ? ` of ${formatNumber(data.pagination.totalPages)}`
                    : ""}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous movements page"
                    disabled={fetching || page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Next movements page"
                    disabled={fetching || page >= data.pagination.totalPages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </nav>
            </>
          )
        )}
        <Button
          variant="outline"
          className="mt-6 w-full"
          disabled={id === null || fetching}
          onClick={refresh}
        >
          <RefreshCw
            className={fetching ? "animate-spin motion-reduce:animate-none" : ""}
            aria-hidden="true"
          />
          {fetching ? "Refreshing inventory" : "Refresh inventory and history"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
