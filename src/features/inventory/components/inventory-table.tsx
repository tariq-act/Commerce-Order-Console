"use client";

import { ArrowUpRight, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatTime, formatNumber } from "@/lib/format";
import { useLatestMovements } from "../hooks/use-inventory";
import type { InventoryProduct } from "../types/inventory";
import { InventoryStockBadge } from "./inventory-stock-badge";

export function InventoryTable({
  products,
  threshold,
  onView,
}: {
  products: InventoryProduct[];
  threshold: number;
  onView: (id: number, trigger: HTMLElement) => void;
}) {
  const latest = useLatestMovements(products);
  return (
    <Table aria-label="Inventory" className="min-w-[780px]">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Product</TableHead>
          <TableHead className="text-right">Current stock</TableHead>
          <TableHead>Stock status</TableHead>
          <TableHead>Last movement · IST</TableHead>
          <TableHead className="pr-6 text-right">
            <span className="sr-only">History</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product, index) => {
          const query = latest[index];
          const movement = query.data;
          return (
            <TableRow key={product.id}>
              <TableCell className="pl-6">
                <p className="max-w-60 font-medium break-words whitespace-normal">{product.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{product.sku}</p>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatNumber(product.stock)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">units</span>
              </TableCell>
              <TableCell>
                <InventoryStockBadge stock={product.stock} threshold={threshold} />
              </TableCell>
              <TableCell>
                {query.isPending ? (
                  <span role="status" aria-label={`Loading latest movement for ${product.name}`}>
                    <Skeleton className="h-9 w-36" />
                  </span>
                ) : query.isError ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    Unavailable
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={query.isFetching}
                      aria-label={`Retry latest movement for ${product.name}`}
                      onClick={() => {
                        void query.refetch();
                      }}
                    >
                      <RotateCw aria-hidden="true" />
                    </Button>
                  </span>
                ) : movement ? (
                  <>
                    <p className="text-xs font-medium">
                      {movement.type === "ORDER_PLACED" ? "Order placed" : "Order cancelled"} ·{" "}
                      {movement.type === "ORDER_PLACED" ? "−" : "+"}
                      {formatNumber(movement.quantity)}
                    </p>
                    <time
                      dateTime={movement.createdAt}
                      className="mt-1 block text-xs text-muted-foreground"
                    >
                      {formatDate(movement.createdAt)} · {formatTime(movement.createdAt)}
                    </time>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">No movements yet</span>
                )}
              </TableCell>
              <TableCell className="pr-6 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`View inventory history for ${product.name}`}
                  onClick={(event) => onView(product.id, event.currentTarget)}
                >
                  History
                  <ArrowUpRight aria-hidden="true" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
