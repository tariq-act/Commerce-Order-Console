import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";
export const metadata: Metadata = { title: "Inventory" };
export default function InventoryPage() {
  return <PlaceholderPage page="inventory" />;
}
