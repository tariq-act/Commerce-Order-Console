import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-6">
      <span className="sr-only">Loading the latest dashboard data.</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-6 h-9 w-24" />
            <Skeleton className="mt-3 h-4 w-36" />
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {[0, 1].map((i) => (
          <Card key={i} className="space-y-6 p-6">
            <Skeleton className="h-6 w-40" />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
