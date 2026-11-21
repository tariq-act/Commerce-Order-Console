import { Check, Circle, PackageCheck, Truck, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OrderDetailsResponse } from "../types/order";

export function OrderTimeline({ status }: Pick<OrderDetailsResponse, "status">) {
  // Cancellation does not disclose whether packing happened. Do not infer that history.
  const steps =
    status === "CANCELLED"
      ? [
          { status: "PLACED", label: "Order placed", icon: Check },
          { status: "CANCELLED", label: "Cancelled", icon: X },
        ]
      : [
          { status: "PLACED", label: "Order placed", icon: Check },
          { status: "PACKED", label: "Packed", icon: PackageCheck },
          { status: "SHIPPED", label: "Shipped", icon: Truck },
        ];
  const current = steps.findIndex((step) => step.status === status);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order progress</CardTitle>
        <CardDescription>Follow this order through fulfilment.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol aria-label="Order status timeline" className="space-y-0">
          {steps.map((step, index) => {
            const reached = index <= current;
            const Icon = reached ? step.icon : Circle;
            return (
              <li
                key={step.status}
                aria-current={index === current ? "step" : undefined}
                className="relative flex gap-3 pb-7 last:pb-0"
              >
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-9 left-4 h-[calc(100%-2rem)] w-px bg-border",
                      index < current && "bg-primary/35",
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground",
                    reached && "border-primary/20 bg-primary/10 text-primary",
                    step.status === "CANCELLED" && "border-rose-200 bg-rose-50 text-rose-700",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="pt-1">
                  <p className={cn("text-sm font-medium", !reached && "text-muted-foreground")}>
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {index === current
                      ? "Current status"
                      : reached
                        ? "Completed"
                        : "Awaiting fulfilment"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        {status === "CANCELLED" && (
          <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            This order is closed. Its reserved inventory has been restored.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
