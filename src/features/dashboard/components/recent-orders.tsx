import Link from "next/link";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { DashboardData } from "../types/dashboard";

export function RecentOrders({ orders }: { orders: DashboardData["recentOrders"] }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-b border-border">
        <div>
          <CardTitle>Recent orders</CardTitle>
          <CardDescription className="mt-1">
            The latest five orders across your workspace.
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/orders">
            View all
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </CardHeader>
      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No orders yet"
          description="Your latest orders will appear here once an order is placed."
          className="py-14 sm:py-16"
          action={
            <Button asChild size="sm">
              <Link href="/orders/new">Create an order</Link>
            </Button>
          }
        />
      ) : (
        <Table aria-label="Recent orders" className="min-w-[690px]">
          <TableHeader>
            <TableRow>
              <TableHead>Order reference</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="whitespace-nowrap">Created · IST</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">
                  <Link
                    className="block max-w-[220px] truncate rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    title={order.reference}
                    href={`/orders/${order.id}`}
                  >
                    {order.reference}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(order.itemCount)}
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
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon-sm">
                    <Link href={`/orders/${order.id}`} aria-label={`View order ${order.reference}`}>
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="border-t border-border px-6 py-3 text-xs leading-5 text-muted-foreground">
        Item counts show total units. Amounts retain the price recorded at placement.
      </p>
    </Card>
  );
}
