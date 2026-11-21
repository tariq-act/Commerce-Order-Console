"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, ReceiptText, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { ApiClientError } from "@/lib/api-client";
import { formatDate, formatTime } from "@/lib/format";
import { useOrderActions, useOrderDetails } from "../hooks/use-order-details";
import { orderActionError } from "../actions";
import { OrderItems } from "./order-items";
import { OrderTimeline } from "./order-timeline";
import { OrderFulfilment } from "./order-fulfilment";

export function parseOrderId(value: string): number | null {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function OrderDetails({ id: rawId }: { id: string }) {
  const id = parseOrderId(rawId);
  const query = useOrderDetails(id);
  const mutation = useOrderActions(query.data);
  const missing = query.error instanceof ApiClientError && query.error.status === 404;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-5 -ml-3">
        <Link href="/orders">
          <ArrowLeft aria-hidden="true" />
          All orders
        </Link>
      </Button>
      {id === null || query.isError ? (
        <Card>
          <EmptyState
            icon={missing || id === null ? ReceiptText : TriangleAlert}
            title={
              id === null
                ? "Invalid order ID"
                : missing
                  ? "Order not found"
                  : "Order details are unavailable"
            }
            description={
              id === null || missing
                ? "Return to all orders and select an existing order."
                : "We couldn’t load this order. Please try again."
            }
            action={
              id !== null && !missing ? (
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => {
                    void query.refetch();
                  }}
                >
                  {query.isFetching ? "Retrying…" : "Try again"}
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link href="/orders">View all orders</Link>
                </Button>
              )
            }
          />
        </Card>
      ) : query.isPending ? (
        <div role="status" aria-label="Loading order details" className="space-y-6">
          <Skeleton className="h-20 w-full max-w-2xl" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
          <span className="sr-only">Loading order details.</span>
        </div>
      ) : (
        <>
          <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3">
                <OrderStatusBadge status={query.data.status} />
              </div>
              <h1
                id="order-details-heading"
                tabIndex={-1}
                className="text-xl leading-snug font-semibold tracking-tight break-words sm:text-2xl"
              >
                {query.data.reference}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Created{" "}
                <time dateTime={query.data.createdAt}>
                  {formatDate(query.data.createdAt)} at {formatTime(query.data.createdAt)} IST
                </time>
              </p>
            </div>
            <Button
              variant="outline"
              className="self-start"
              disabled={query.isFetching || mutation.isPending}
              onClick={() => {
                void query.refetch();
              }}
            >
              <RefreshCw
                className={query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}
                aria-hidden="true"
              />
              Refresh
            </Button>
          </header>
          {mutation.isError && (
            <Card role="alert" className="mb-6 border-rose-200">
              <CardContent className="pt-5 text-sm text-destructive">
                {orderActionError(mutation.error)}
              </CardContent>
            </Card>
          )}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <OrderItems order={query.data} />
            <aside aria-label="Order progress and actions" className="space-y-6">
              <OrderTimeline status={query.data.status} />
              <OrderFulfilment
                order={query.data}
                pending={mutation.isPending}
                refreshing={query.isFetching}
                action={mutation.variables?.action}
                onAction={mutation.submit}
              />
            </aside>
          </div>
        </>
      )}
    </>
  );
}
