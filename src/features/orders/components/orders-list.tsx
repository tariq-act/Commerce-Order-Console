"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Plus, ReceiptText, RefreshCw, SearchX, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useOrderFilters } from "../hooks/use-order-filters";
import { useOrders } from "../hooks/use-orders";
import { OrderFilters } from "./order-filters";
import { OrdersTable } from "./orders-table";
import { OrdersPagination } from "./orders-pagination";
import { OrdersSkeleton } from "./orders-skeleton";

export function OrdersList() {
  const filters = useOrderFilters();
  const query = useOrders(filters.validation.success ? filters.validation.data : undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const loading = filters.isDebouncing || query.isPending;
  useEffect(() => {
    if (query.isError)
      toast.error("Orders couldn’t be loaded", {
        id: "orders-list-error",
        description: "Try again to load the latest orders.",
      });
    else if (query.isSuccess) toast.dismiss("orders-list-error");
  }, [query.isError, query.isSuccess, query.errorUpdatedAt]);
  const data = query.data;
  const outOfRange = data && data.orders.length === 0 && data.pagination.page > 1;
  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order, with the context you need."
        action={
          <>
            <Button
              variant="outline"
              disabled={query.isFetching || !filters.validation.success}
              aria-label="Refresh orders"
              onClick={() => {
                void client.invalidateQueries({ queryKey: ["orders"] });
              }}
            >
              <RefreshCw
                className={query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">
                {query.isFetching ? "Refreshing" : "Refresh"}
              </span>
            </Button>
            <Button asChild>
              <Link href="/orders/new">
                <Plus aria-hidden="true" />
                Create order
              </Link>
            </Button>
          </>
        }
      />
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Order management</CardTitle>
            <CardDescription className="mt-1">Find, review and follow your orders.</CardDescription>
          </div>
          <span className="hidden size-10 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground sm:flex">
            <ReceiptText className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </span>
        </CardHeader>
        <OrderFilters
          search={filters.draft}
          onSearch={filters.setDraft}
          onClearSearch={filters.clearSearch}
          status={filters.status}
          onStatus={filters.setStatus}
          hasFilters={filters.hasFilters}
          onClear={filters.clearFilters}
          inputRef={inputRef}
        />
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-3 text-[0.8125rem]">
          <p role="status" className="text-muted-foreground">
            {!filters.validation.success
              ? "Filters need attention"
              : loading
                ? "Loading orders…"
                : query.isError
                  ? "Orders unavailable"
                  : "Newest orders first"}
          </p>
          <Badge variant="outline">
            {filters.status === "all"
              ? "All statuses"
              : filters.status[0] + filters.status.slice(1).toLowerCase()}
          </Badge>
        </div>
        {!filters.validation.success ? (
          <div role="alert" className="px-6 py-12 text-center">
            <h2 className="text-lg font-semibold">Check your order filters</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Use one valid status, a search of up to 200 characters, a positive page, and a limit
              from 1 to 100.
            </p>
            <Button variant="outline" className="mt-5" onClick={filters.clearFilters}>
              Reset filters
            </Button>
          </div>
        ) : loading ? (
          <OrdersSkeleton />
        ) : query.isError ? (
          <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold">Orders are unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              We couldn’t load the latest orders. Please try again.
            </p>
            <Button
              variant="outline"
              className="mt-5"
              disabled={query.isFetching}
              onClick={() => {
                void query.refetch();
              }}
            >
              {query.isFetching ? "Retrying…" : "Try again"}
            </Button>
          </div>
        ) : (
          data && (
            <>
              {data.orders.length > 0 ? (
                <OrdersTable orders={data.orders} />
              ) : outOfRange ? (
                <EmptyState
                  icon={ReceiptText}
                  title="There are no orders on this page"
                  description="Return to the first page to see the available results."
                  action={
                    <Button variant="outline" onClick={() => filters.setPage(1)}>
                      Go to first page
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={filters.hasFilters ? SearchX : ReceiptText}
                  title={filters.hasFilters ? "No orders match these filters" : "No orders yet"}
                  description={
                    filters.hasFilters
                      ? "Try another reference or status, or clear your filters."
                      : "Create an order to start tracking its progress here."
                  }
                  action={
                    filters.hasFilters ? (
                      <Button variant="outline" onClick={filters.clearFilters}>
                        Clear filters
                      </Button>
                    ) : (
                      <Button asChild>
                        <Link href="/orders/new">
                          <Plus aria-hidden="true" />
                          Create your first order
                        </Link>
                      </Button>
                    )
                  }
                />
              )}
              <OrdersPagination
                pagination={data.pagination}
                rowCount={data.orders.length}
                disabled={query.isFetching || filters.isDebouncing}
                onPage={filters.setPage}
                onLimit={filters.setLimit}
              />
            </>
          )
        )}
        <p className="border-t border-border px-6 py-4 text-xs leading-5 text-muted-foreground">
          Items show total units. Amounts retain the prices recorded on each order.
        </p>
      </Card>
    </>
  );
}
