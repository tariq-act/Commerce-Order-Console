import { CircleCheck, CircleMinus, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { inventoryStockStatus } from "../types/inventory";

export function InventoryStockBadge({ stock, threshold }: { stock: number; threshold: number }) {
  const status = inventoryStockStatus(stock, threshold);
  const Icon =
    status === "out_of_stock" ? CircleMinus : status === "low_stock" ? TriangleAlert : CircleCheck;
  return (
    <Badge
      variant="outline"
      className={
        status === "out_of_stock"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : status === "low_stock"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }
    >
      <Icon className="size-3" aria-hidden="true" />
      {status === "out_of_stock"
        ? "Out of stock"
        : status === "low_stock"
          ? "Low stock"
          : "In stock"}
    </Badge>
  );
}
