"use client";

import { useRef, useState } from "react";
import { LoaderCircle, PackageCheck, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { canChangeOrderStatus, type OrderAction } from "../actions";
import type { OrderDetailsResponse } from "../types/order";

export function OrderFulfilment({
  order,
  pending,
  refreshing,
  action,
  onAction,
}: {
  order: OrderDetailsResponse;
  pending: boolean;
  refreshing: boolean;
  action?: OrderAction;
  onAction: (action: OrderAction) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const locked = pending || refreshing;
  const canCancel = canChangeOrderStatus(order.status, "CANCELLED");
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Fulfilment</CardTitle>
          <CardDescription>
            {order.status === "SHIPPED"
              ? "This order has shipped and is complete."
              : order.status === "CANCELLED"
                ? "This order has been cancelled."
                : "Move the order to its next stage."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3" aria-busy={pending}>
          <Button
            className="w-full"
            disabled={locked || !canChangeOrderStatus(order.status, "PACKED")}
            onClick={() => {
              void onAction("PACKED");
            }}
          >
            <PackageCheck aria-hidden="true" />
            {pending && action === "PACKED" ? "Packing…" : "Mark as packed"}
          </Button>
          <Button
            className="w-full"
            variant={order.status === "PACKED" ? "default" : "outline"}
            disabled={locked || !canChangeOrderStatus(order.status, "SHIPPED")}
            onClick={() => {
              void onAction("SHIPPED");
            }}
          >
            <Truck aria-hidden="true" />
            {pending && action === "SHIPPED" ? "Shipping…" : "Mark as shipped"}
          </Button>
          <div className="border-t border-border pt-3">
            <Button
              ref={cancelButton}
              className="w-full text-destructive hover:text-destructive"
              variant="ghost"
              disabled={locked || !canCancel}
              onClick={() => setConfirming(true)}
            >
              <X aria-hidden="true" />
              Cancel order
            </Button>
          </div>
          <p role="status" className="text-xs leading-5 text-muted-foreground">
            {pending
              ? "Updating the order…"
              : refreshing
                ? "Refreshing order status…"
                : order.status === "SHIPPED" || order.status === "CANCELLED"
                  ? "No further status changes are available."
                  : "Orders must be packed before they can ship."}
          </p>
        </CardContent>
      </Card>
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!pending) setConfirming(open);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (cancelButton.current && !cancelButton.current.disabled)
              cancelButton.current.focus();
            else document.getElementById("order-details-heading")?.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("keep-order")?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription className="break-words">
              {order.reference} will be cancelled and all its inventory restored. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              id="keep-order"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Keep order
            </Button>
            <Button
              variant="destructive"
              disabled={locked || !canCancel}
              onClick={async () => {
                if (await onAction("CANCELLED")) setConfirming(false);
              }}
            >
              {pending && action === "CANCELLED" && (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {pending && action === "CANCELLED" ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
