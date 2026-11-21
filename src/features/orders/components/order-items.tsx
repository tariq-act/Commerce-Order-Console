import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { OrderDetailsResponse } from "../types/order";

export function OrderItems({ order }: { order: OrderDetailsResponse }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>Order items</CardTitle>
        <CardDescription>
          {formatNumber(order.items.length)} products · Prices recorded at checkout
        </CardDescription>
      </CardHeader>
      <Table aria-label="Order items" className="min-w-[600px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">Product</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead className="pr-6 text-right">Subtotal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="pl-6">
                <p className="max-w-72 font-medium break-words whitespace-normal">
                  {item.productName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{item.sku}</p>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(item.quantity)}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {formatCurrency(item.unitPriceCents)}
              </TableCell>
              <TableCell className="pr-6 text-right font-medium whitespace-nowrap tabular-nums">
                {formatCurrency(item.subtotalCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-4 border-t border-border bg-muted/20 px-6 py-5">
        <span className="text-sm font-medium">Order total · INR</span>
        <strong className="text-xl tracking-tight tabular-nums">
          {formatCurrency(order.totalCents)}
        </strong>
      </div>
    </Card>
  );
}
