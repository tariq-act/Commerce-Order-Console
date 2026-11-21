"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, RefreshCw, ShoppingBag, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";
import { useProducts } from "@/features/products/hooks/use-products";
import { orderPayload } from "../cart";
import { useOrderCart } from "../hooks/use-order-cart";
import { orderErrorMessage, useCreateOrder } from "../hooks/use-create-order";
import type { CreatedOrderResponse } from "../types/order";
import { ProductSelector } from "./product-selector";
import { OrderCart } from "./order-cart";
import { OrderConfirmation } from "./order-confirmation";

export function CreateOrderForm() {
  const products = useProducts({});
  const cart = useOrderCart(products.data);
  const placement = useCreateOrder();
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useState<CreatedOrderResponse | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const quantities = new Map(cart.items.map((item) => [item.product.id, item.quantity]));
  const locked = placement.isPending;
  const stockUnknown = products.isPending || products.isError;
  const disabled =
    cart.items.length === 0 || cart.hasUnavailable || cart.totals === null || stockUnknown;
  useEffect(() => {
    if (placement.isError) errorRef.current?.focus();
  }, [placement.isError, placement.submittedAt]);
  useEffect(() => {
    if (confirmation)
      successRef.current?.querySelector<HTMLElement>("#order-confirmation")?.focus();
  }, [confirmation]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || placement.isSubmitting()) return;
    try {
      const order = await placement.submit(orderPayload(cart.items));
      if (!order) return;
      cart.clear();
      setConfirmation(order);
      toast.success("Order created", { description: order.reference });
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.outcomeUnknown
          ? "Check the order status"
          : "Order was not created",
        { description: orderErrorMessage(error) },
      );
    }
  }
  const notice =
    cart.totals === null
      ? "The cart exceeds the supported amount or quantity range. Reduce quantities to continue."
      : cart.hasUnavailable
        ? "Availability has changed. Adjust or remove the marked products before placing the order."
        : stockUnknown && cart.items.length > 0
          ? "Current inventory could not be verified. Refresh availability before placing the order."
          : undefined;
  return (
    <>
      <PageHeader
        title="New order"
        description="Build an order, review your selection, and place it with confidence."
        action={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/orders">
                <ArrowLeft aria-hidden="true" />
                All orders
              </Link>
            </Button>
            {!confirmation && (
              <Button asChild variant="outline" size="sm" className="xl:hidden">
                <a href="#order-cart">
                  <ShoppingBag aria-hidden="true" />
                  Cart ({cart.totals?.itemCount ?? cart.items.length})
                </a>
              </Button>
            )}
          </>
        }
      />
      {confirmation ? (
        <div ref={successRef}>
          <OrderConfirmation
            order={confirmation}
            onAnother={() => {
              setConfirmation(null);
              placement.reset();
            }}
          />
        </div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-4">
            <ProductSelector
              quantities={quantities}
              locked={locked}
              onAdd={(product) => {
                if (!placement.isSubmitting()) {
                  placement.reset();
                  cart.add(product);
                }
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={products.isFetching || locked}
              onClick={() => {
                void client.invalidateQueries({ queryKey: ["products"] });
              }}
            >
              <RefreshCw
                className={products.isFetching ? "animate-spin motion-reduce:animate-none" : ""}
                aria-hidden="true"
              />
              {products.isFetching ? "Refreshing availability" : "Refresh availability"}
            </Button>
          </div>
          <form onSubmit={submit} aria-label="Create order" className="min-w-0 xl:sticky xl:top-24">
            <OrderCart
              items={cart.items}
              totals={cart.totals}
              locked={locked}
              disabled={disabled}
              notice={notice}
              onQuantity={(product, quantity) => {
                if (!placement.isSubmitting()) {
                  placement.reset();
                  cart.setQuantity(product, quantity);
                }
              }}
              onRemove={(id) => {
                if (!placement.isSubmitting()) {
                  placement.reset();
                  cart.remove(id);
                }
              }}
              error={
                placement.isError ? (
                  <div
                    ref={errorRef}
                    role="alert"
                    tabIndex={-1}
                    className="space-y-2 border-b border-border bg-rose-50/70 px-6 py-4 text-sm outline-none"
                  >
                    <p className="flex items-center gap-2 font-medium text-rose-800">
                      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                      {placement.error instanceof ApiClientError && placement.error.outcomeUnknown
                        ? "Check your orders"
                        : "Order not placed"}
                    </p>
                    <p className="text-xs leading-5 text-rose-800">
                      {orderErrorMessage(placement.error)}
                    </p>
                    {placement.error instanceof ApiClientError &&
                      placement.error.outcomeUnknown && (
                        <Link
                          href="/orders"
                          className="inline-block rounded-sm text-xs font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          View all orders
                        </Link>
                      )}
                  </div>
                ) : undefined
              }
            />
          </form>
        </div>
      )}
    </>
  );
}
