import { Banknote, Clock3, ShoppingBag, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { DashboardData } from "../types/dashboard";

export function StatsCards({ metrics }: { metrics: DashboardData["metrics"] }) {
  const stats = [
    {
      label: "Total orders",
      value: formatNumber(metrics.totalOrders),
      detail: "Across all statuses",
      icon: ShoppingBag,
      color: "bg-[#f1edff] text-primary",
    },
    {
      label: "Pending orders",
      value: formatNumber(metrics.pendingOrders),
      detail: "Placed · ready to pack",
      icon: Clock3,
      color: "bg-amber-50 text-amber-700",
    },
    {
      label: "Shipped orders",
      value: formatNumber(metrics.shippedOrders),
      detail: "On their way to customers",
      icon: Truck,
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Total revenue",
      value: formatCurrency(metrics.totalRevenueCents),
      detail: "All non-cancelled orders",
      icon: Banknote,
      color: "bg-blue-50 text-blue-700",
    },
  ];
  return (
    <section aria-label="Order metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(({ label, value, detail, icon: Icon, color }) => (
        <Card key={label} className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${color}`}
            >
              <Icon className="size-[1.125rem]" strokeWidth={1.7} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-5 break-words text-[1.75rem] leading-tight font-semibold tracking-[-0.04em] tabular-nums">
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
        </Card>
      ))}
    </section>
  );
}
