import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";
export const metadata: Metadata = { title: "Order details" };
export default function OrderDetailsPage() {
  return <PlaceholderPage page="order-detail" />;
}
