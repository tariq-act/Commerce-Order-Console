import Link from "next/link";
import { ArrowUpRight, PackageCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatNumber } from "@/lib/format";
import type { DashboardData } from "../types/dashboard";

export function LowStockProducts({
  products,
  threshold,
}: {
  products: DashboardData["lowStockProducts"];
  threshold: number;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-b border-border">
        <div>
          <CardTitle>Low stock products</CardTitle>
          <CardDescription className="mt-1">
            {formatNumber(threshold)} units or fewer · includes out of stock
          </CardDescription>
        </div>
        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          {formatNumber(products.length)} to review
        </Badge>
      </CardHeader>
      {products.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No low-stock products"
          description="There are no products at or below your stock threshold."
          className="py-14 sm:py-16"
        />
      ) : (
        <ul
          className="max-h-[396px] divide-y divide-border overflow-y-auto"
          aria-label="Low stock products"
        >
          {products.map((product) => (
            <li key={product.id} className="flex items-start justify-between gap-4 px-6 py-5">
              <div className="min-w-0">
                <p className="text-sm leading-6 font-medium break-words">{product.name}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground break-all">
                  {product.sku}
                </p>
                <Badge
                  variant="outline"
                  className={
                    product.stock === 0
                      ? "mt-2 border-rose-200 bg-rose-50 text-rose-700"
                      : "mt-2 border-amber-200 bg-amber-50 text-amber-800"
                  }
                >
                  {product.stock === 0 ? "Out of stock" : "Low stock"}
                </Badge>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xl leading-7 font-semibold tabular-nums">
                  {formatNumber(product.stock)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">available</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border px-4 py-3">
        <Button asChild variant="ghost" size="sm" className="w-full justify-between">
          <Link href="/inventory">
            Manage inventory
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
