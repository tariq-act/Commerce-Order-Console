import type { Metadata } from "next";
import { OrderDetails } from "@/features/orders/components/order-details";
export const metadata: Metadata = { title: "Order details" };
export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetails id={id} />;
}
