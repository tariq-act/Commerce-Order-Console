"use client";

import Link from "next/link";
import { ArrowUpRight, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { OrderSummaryResponse } from "../types/order";
import { useOrderItemCounts } from "../hooks/use-orders";

export function OrdersTable({ orders }: { orders: OrderSummaryResponse[] }) {
  const counts = useOrderItemCounts(orders);
  return (
    <Table aria-label="Orders" className="min-w-[850px]">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Order reference</TableHead>
          <TableHead className="text-right">Items</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="whitespace-nowrap">Created · IST</TableHead>
          <TableHead className="pr-6 text-right">
            <span className="sr-only">Details</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order, index) => {
          const count = counts[index];
          return (
            <TableRow key={order.id}>
              <TableCell className="pl-6 font-medium">
                <Link
                  href={`/orders/${order.id}`}
                  title={order.reference}
                  className="block max-w-[360px] truncate rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {order.reference}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {count.isPending ? (
                  <span className="inline-flex">
                    <span className="sr-only">Loading item count</span>
                    <Skeleton className="h-5 w-9" />
                  </span>
                ) : count.isError ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    Unavailable
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Retry item count for ${order.reference}`}
                      disabled={count.isFetching}
                      onClick={() => {
                        void count.refetch();
                      }}
                    >
                      <RotateCw
                        className={
                          count.isFetching ? "animate-spin motion-reduce:animate-none" : ""
                        }
                        aria-hidden="true"
                      />
                    </Button>
                  </span>
                ) : (
                  formatNumber(count.data)
                )}
              </TableCell>
              <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                {formatCurrency(order.totalCents)}
              </TableCell>
              <TableCell>
                <OrderStatusBadge status={order.status} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
              </TableCell>
              <TableCell className="pr-6 text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/orders/${order.id}`} aria-label={`View order ${order.reference}`}>
                    View
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
