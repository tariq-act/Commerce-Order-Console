import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductCatalogue } from "@/features/products/components/product-catalogue";
import { ProductsPageSkeleton } from "@/features/products/components/products-skeleton";

export const metadata: Metadata = { title: "Products" };
export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductsPageSkeleton />}>
      <ProductCatalogue />
    </Suspense>
  );
}
