"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { navigationItems } from "@/lib/navigation";

export function WorkspaceGuide({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Make yourself at home</DialogTitle>
          <DialogDescription>
            A few familiar places to keep your commerce operations organized.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {navigationItems.slice(1).map(({ label, href, icon: Icon, description }) => (
            <Link
              key={href}
              href={href}
              onClick={() => onOpenChange(false)}
              className="flex items-start gap-3 rounded-xl p-3 outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/25"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {description}
                </span>
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-6 border-t border-border pt-5">
          <p className="mb-3 text-[0.8125rem] font-medium text-muted-foreground">
            Order status reference
          </p>
          <div className="flex flex-wrap gap-2">
            {(["PLACED", "PACKED", "SHIPPED", "CANCELLED"] as const).map((status) => (
              <OrderStatusBadge key={status} status={status} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
