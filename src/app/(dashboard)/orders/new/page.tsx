import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";
export const metadata: Metadata = { title: "New order" };
export default function NewOrderPage() {
  return <PlaceholderPage page="new-order" />;
}
