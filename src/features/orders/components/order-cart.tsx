import { ShoppingBag } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { CatalogueProduct } from "@/features/products/types/product";
import type { CartItem, cartTotals } from "../cart";
import { OrderCartItem } from "./order-cart-item";
import { OrderSummary } from "./order-summary";

export function OrderCart({
  items,
  totals,
  locked,
  disabled,
  onQuantity,
  onRemove,
  notice,
  error,
}: {
  items: CartItem[];
  totals: ReturnType<typeof cartTotals>;
  locked: boolean;
  disabled: boolean;
  onQuantity: (product: CatalogueProduct, quantity: number) => void;
  onRemove: (id: number) => void;
  notice?: string;
  error?: React.ReactNode;
}) {
  return (
    <Card id="order-cart" className="min-w-0 scroll-mt-24 overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border">
        <div>
          <CardTitle>Order cart</CardTitle>
          <CardDescription className="mt-1">Review your selection before placing.</CardDescription>
        </div>
        <Badge variant="outline">
          {items.length} {items.length === 1 ? "product" : "products"}
        </Badge>
      </CardHeader>
      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Add products from the catalogue to get started."
          className="py-10 sm:py-12 [&_h2]:text-base [&>div:first-child]:size-12 [&>div:first-child]:mb-4"
        />
      ) : (
        <ul aria-label="Order cart items" className="divide-y divide-border border-b border-border">
          {items.map((item, index) => (
            <OrderCartItem
              key={item.product.id}
              item={item}
              subtotal={totals?.subtotals[index]}
              locked={locked}
              onQuantity={(quantity) => onQuantity(item.product, quantity)}
              onRemove={() => onRemove(item.product.id)}
            />
          ))}
        </ul>
      )}
      {notice && (
        <p
          role="status"
          className="border-b border-border bg-amber-50/70 px-6 py-4 text-xs leading-5 text-amber-900"
        >
          {notice}
        </p>
      )}
      {error}
      <OrderSummary totals={totals} disabled={disabled} pending={locked} />
    </Card>
  );
}
