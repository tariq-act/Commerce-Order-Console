"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTime } from "@/lib/format";
import { useDashboard } from "../hooks/use-dashboard";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { StatsCards } from "./stats-cards";
import { RecentOrders } from "./recent-orders";
import { LowStockProducts } from "./low-stock-products";
import { QuickActions } from "./quick-actions";

export function Dashboard() {
  const query = useDashboard();
  useEffect(() => {
    if (query.isError)
      toast.error("Dashboard couldn’t be updated", {
        id: "dashboard-error",
        description: "Check your connection and try again.",
      });
    else if (query.isSuccess) toast.dismiss("dashboard-error");
  }, [query.isError, query.isSuccess, query.errorUpdatedAt]);

  return (
    <div className="space-y-6">
      <DashboardHeader
        refreshing={query.isFetching}
        onRefresh={() => {
          void query.refetch();
        }}
      />
      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <Card role="alert" className="flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
            <TriangleAlert className="size-6" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold">Dashboard data is unavailable</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            We couldn’t load the latest figures. Check your connection and try again. Figures are
            hidden until an update succeeds.
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => {
              void query.refetch();
            }}
            disabled={query.isFetching}
          >
            {query.isFetching ? "Retrying…" : "Try again"}
          </Button>
        </Card>
      ) : (
        <>
          <StatsCards metrics={query.data.metrics} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>All-time activity · revenue excludes cancelled orders</span>
            <span role="status">Updated {formatTime(query.data.generatedAt)} IST</span>
          </div>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <RecentOrders orders={query.data.recentOrders} />
            <LowStockProducts
              products={query.data.lowStockProducts}
              threshold={query.data.lowStockThreshold}
            />
          </div>
        </>
      )}
      <QuickActions />
    </div>
  );
}
