import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";

export function OrdersSkeleton() {
  return (
    <div role="status" aria-label="Loading orders" className="px-6 pb-3">
      <span className="sr-only">Loading orders.</span>
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="flex items-center gap-6 border-b border-border py-6 last:border-0"
        >
          <Skeleton className="h-5 w-3/5 max-w-80" />
          <Skeleton className="ml-auto h-5 w-20" />
          <Skeleton className="hidden h-6 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}
export function OrdersPageSkeleton() {
  return (
    <>
      <PageHeader title="Orders" description="Every order, with the context you need." />
      <Card className="min-w-0 overflow-hidden">
        <div className="space-y-4 border-b border-border p-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full max-w-md" />
        </div>
        <OrdersSkeleton />
      </Card>
    </>
  );
}
