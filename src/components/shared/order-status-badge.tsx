import type { OrderStatus } from "@/db/types";
import { Badge } from "@/components/ui/badge";

const statusStyles = {
  PLACED: { label: "Placed", variant: "placed" },
  PACKED: { label: "Packed", variant: "packed" },
  SHIPPED: { label: "Shipped", variant: "shipped" },
  CANCELLED: { label: "Cancelled", variant: "cancelled" },
} as const;

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const style = statusStyles[status];
  return <Badge variant={style.variant}>{style.label}</Badge>;
}
