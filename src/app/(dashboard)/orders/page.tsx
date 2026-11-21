import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";
export const metadata: Metadata = { title: "Orders" };
export default function OrdersPage() {
  return <PlaceholderPage page="orders" />;
}
