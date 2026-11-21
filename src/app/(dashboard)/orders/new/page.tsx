import type { Metadata } from "next";
import { CreateOrderForm } from "@/features/orders/components/create-order-form";

export const metadata: Metadata = { title: "New order" };
export default function NewOrderPage() {
  return <CreateOrderForm />;
}
