import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { CartItem } from "../cart";

export function OrderCartItem({
  item,
  subtotal,
  locked,
  onQuantity,
  onRemove,
}: {
  item: CartItem;
  subtotal: number | undefined;
  locked: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const { product, quantity, missing } = item;
  const unavailable = missing || quantity > product.stock;
  return (
    <li className="space-y-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium leading-6 break-words">{product.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground break-all">{product.sku}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatCurrency(product.priceCents)} per unit
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={locked}
          aria-label={`Remove ${product.name} from cart`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div
          role="group"
          aria-label={`Quantity for ${product.name}`}
          className="flex items-center rounded-lg border border-border bg-white p-0.5"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={locked || missing || product.stock === 0 || quantity <= 1}
            aria-label={`Decrease quantity of ${product.name}`}
            onClick={() => onQuantity(quantity - 1)}
          >
            <Minus aria-hidden="true" />
          </Button>
          <output
            aria-label={`${product.name} quantity`}
            className="min-w-10 px-1 text-center text-sm font-medium tabular-nums"
          >
            {formatNumber(quantity)}
          </output>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={locked || missing || quantity >= product.stock}
            aria-label={`Increase quantity of ${product.name}`}
            onClick={() => onQuantity(quantity + 1)}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <p className="text-sm font-semibold tabular-nums">
          {subtotal === undefined ? "Amount too large" : formatCurrency(subtotal)}
        </p>
      </div>
      {unavailable && (
        <p role="status" className="text-xs leading-5 text-destructive">
          {missing
            ? "This product is no longer available. Remove it to continue."
            : `Only ${formatNumber(product.stock)} available now. Reduce the quantity or remove this product.`}
        </p>
      )}
    </li>
  );
}
