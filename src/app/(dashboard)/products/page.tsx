import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";
export const metadata: Metadata = { title: "Products" };
export default function ProductsPage() {
  return <PlaceholderPage page="products" />;
}
