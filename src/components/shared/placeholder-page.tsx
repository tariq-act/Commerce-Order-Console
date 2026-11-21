import Link from "next/link";
import { Boxes, FilePlus2, Package, Plus, ReceiptText, ShoppingBag } from "lucide-react";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const pages = {
  products: {
    title: "Products",
    description: "A thoughtfully organized home for your catalogue.",
    icon: Package,
    heading: "Your catalogue belongs here",
    detail:
      "Product browsing and management are coming next. This space will keep every product detail within reach.",
  },
  orders: {
    title: "Orders",
    description: "Every order, with the context you need.",
    icon: ShoppingBag,
    heading: "A clearer view of every order",
    detail:
      "Order management is coming next. Follow your orders and their progress together in one focused place.",
  },
  "new-order": {
    title: "New order",
    description: "Bring the right products together in a new order.",
    icon: FilePlus2,
    heading: "Your next order starts here",
    detail:
      "The order creation interface is being prepared. You’ll be able to build and review an order in this space.",
  },
  "order-detail": {
    title: "Order details",
    description: "The complete picture of an individual order.",
    icon: ReceiptText,
    heading: "The details, all together",
    detail:
      "An order’s products, progress, and history will be available here. The detail interface is coming next.",
  },
  inventory: {
    title: "Inventory",
    description: "A focused space for stock and its movements.",
    icon: Boxes,
    heading: "Know where your inventory stands",
    detail:
      "Inventory visibility and movement history are coming next. This space will bring stock and context together.",
  },
} as const;

export function PlaceholderPage({ page }: { page: keyof typeof pages }) {
  const info = pages[page];
  const backToOrders = page === "new-order" || page === "order-detail";
  return (
    <div>
      <PageHeader
        title={info.title}
        description={info.description}
        action={
          page === "orders" ? (
            <Button asChild>
              <Link href="/orders/new">
                <Plus />
                New order
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <h2 className="text-sm font-medium">{info.title}</h2>
          <Badge variant="outline">Coming soon</Badge>
        </div>
        <EmptyState
          icon={info.icon}
          title={info.heading}
          description={info.detail}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={backToOrders ? "/orders" : "/dashboard"}>
                {backToOrders ? "Back to orders" : "Back to overview"}
              </Link>
            </Button>
          }
        />
        <div className="border-t border-border bg-muted/20 px-6 py-4 text-center text-[0.8125rem] leading-6 text-muted-foreground">
          You’re in the right place. This workspace is being prepared.
        </div>
      </Card>
    </div>
  );
}
