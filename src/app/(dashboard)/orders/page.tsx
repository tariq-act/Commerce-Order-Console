import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersList } from "@/features/orders/components/orders-list";
import { OrdersPageSkeleton } from "@/features/orders/components/orders-skeleton";

export const metadata: Metadata = { title: "Orders" };
export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersPageSkeleton />}>
      <OrdersList />
    </Suspense>
  );
}
