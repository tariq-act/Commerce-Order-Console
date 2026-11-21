import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading workspace">
      <span className="sr-only">Loading workspace…</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-3 h-4 w-64 max-w-full" />
      <Card className="mt-8 p-8">
        <Skeleton className="h-40 w-full" />
      </Card>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-44" />
        ))}
      </div>
    </div>
  );
}
