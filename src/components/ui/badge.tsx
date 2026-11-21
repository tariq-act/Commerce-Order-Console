import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[0.8125rem] font-medium leading-5 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border bg-white text-muted-foreground",
        placed: "border-blue-200/70 bg-blue-50 text-blue-800",
        packed: "border-amber-200/80 bg-amber-50 text-amber-900",
        shipped: "border-emerald-200/70 bg-emerald-50 text-emerald-800",
        cancelled: "border-slate-200 bg-slate-100 text-slate-700",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
