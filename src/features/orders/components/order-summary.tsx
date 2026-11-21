import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { cartTotals } from "../cart";

export function OrderSummary({
  totals,
  disabled,
  pending,
}: {
  totals: ReturnType<typeof cartTotals>;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <div className="space-y-5 p-5 sm:p-6">
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Total items</dt>
          <dd className="font-medium tabular-nums">
            {totals ? formatNumber(totals.itemCount) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="font-medium tabular-nums">
            {totals ? formatCurrency(totals.totalCents) : "—"}
          </dd>
        </div>
      </dl>
      <Separator />
      <div className="flex justify-between gap-3 text-base font-semibold">
        <span>Estimated total</span>
        <output aria-label="Estimated order total" className="text-right tabular-nums">
          {totals ? formatCurrency(totals.totalCents) : "—"}
        </output>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        The final price and inventory are confirmed by the server when you place the order.
      </p>
      <Button type="submit" size="lg" className="w-full" disabled={disabled || pending}>
        <ShoppingBag aria-hidden="true" />
        {pending ? "Placing order…" : "Place order"}
      </Button>
      {pending && (
        <p role="status" className="text-center text-xs leading-5 text-muted-foreground">
          Placing your order. Please keep this page open.
        </p>
      )}
    </div>
  );
}
