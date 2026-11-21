import Link from "next/link";
import { ArrowUpRight, Boxes, ListOrdered, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const actions = [
  { label: "Create order", href: "/orders/new", icon: Plus },
  { label: "View products", href: "/products", icon: Package },
  { label: "Manage inventory", href: "/inventory", icon: Boxes },
  { label: "View all orders", href: "/orders", icon: ListOrdered },
] as const;
export function QuickActions() {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">Quick actions</h2>
        <p className="text-sm text-muted-foreground">Keep your next step close.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map(({ label, href, icon: Icon }, index) => (
          <Button
            asChild
            key={href}
            variant={index === 0 ? "default" : "outline"}
            className="h-11 justify-start"
          >
            <Link href={href}>
              <Icon aria-hidden="true" />
              {label}
              <ArrowUpRight className="ml-auto" aria-hidden="true" />
            </Link>
          </Button>
        ))}
      </div>
    </Card>
  );
}
