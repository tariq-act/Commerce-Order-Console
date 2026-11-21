import Link from "next/link";
import { ArrowUpRight, CircleCheck, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { CreatedOrderResponse } from "../types/order";

export function OrderConfirmation({
  order,
  onAnother,
}: {
  order: CreatedOrderResponse;
  onAnother: () => void;
}) {
  return (
    <Card className="mx-auto max-w-2xl overflow-hidden">
      <CardHeader className="items-center border-b border-border px-6 py-8 text-center">
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <CircleCheck className="size-7" strokeWidth={1.6} aria-hidden="true" />
        </span>
        <CardTitle tabIndex={-1} id="order-confirmation" className="text-xl outline-none">
          Order created
        </CardTitle>
        <CardDescription>Your order is placed and inventory has been updated.</CardDescription>
      </CardHeader>
      <div className="space-y-6 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Order reference</p>
            <p className="mt-2 text-sm font-medium leading-6 break-all">{order.reference}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Created {formatDate(order.createdAt)} · IST
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <Separator />
        <ul aria-label="Confirmed order items" className="space-y-4">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-start justify-between gap-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium break-words">{item.productName}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {formatNumber(item.quantity)} × {formatCurrency(item.unitPriceCents)}
                </p>
              </div>
              <span className="shrink-0 font-medium tabular-nums">
                {formatCurrency(Number(BigInt(item.quantity) * BigInt(item.unitPriceCents)))}
              </span>
            </li>
          ))}
        </ul>
        <Separator />
        <div className="flex justify-between gap-4 text-lg font-semibold">
          <span>Confirmed total</span>
          <span className="tabular-nums">{formatCurrency(order.totalCents)}</span>
        </div>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row">
          <Button asChild className="flex-1">
            <Link href={`/orders/${order.id}`}>
              View order details
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="outline" onClick={onAnother} className="flex-1">
            <Plus aria-hidden="true" />
            Create another order
          </Button>
        </div>
      </div>
    </Card>
  );
}
