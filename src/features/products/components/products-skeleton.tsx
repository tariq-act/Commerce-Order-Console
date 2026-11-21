import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductsSkeleton() {
  return (
    <div role="status" aria-label="Loading products" className="space-y-0 px-6 pb-4">
      <span className="sr-only">Loading current product information.</span>
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-border py-5 last:border-0"
        >
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5 max-w-52" />
            <Skeleton className="h-3 w-2/5 max-w-32" />
          </div>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="hidden h-5 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}
export function ProductsPageSkeleton() {
  return (
    <>
      <PageHeader title="Products" description="Your catalogue, with every detail in reach." />
      <Card className="min-w-0 overflow-hidden">
        <div className="space-y-4 border-b border-border p-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full max-w-md" />
        </div>
        <ProductsSkeleton />
      </Card>
    </>
  );
}
