import { Badge } from "@/components/ui/badge";
import { CircleCheck, CircleMinus } from "lucide-react";

export function ProductStatusBadge({ stock }: { stock: number }) {
  const available = stock > 0;
  const Icon = available ? CircleCheck : CircleMinus;
  return (
    <Badge
      variant="outline"
      className={
        available
          ? "border-emerald-200/70 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-100 text-slate-600"
      }
    >
      <Icon className="size-3" aria-hidden="true" />
      {available ? "In stock" : "Out of stock"}
    </Badge>
  );
}
