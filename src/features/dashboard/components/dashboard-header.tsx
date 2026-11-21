import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export function DashboardHeader({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <PageHeader
      title="Overview"
      description="Your commerce operations, at a glance."
      action={
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={refreshing ? "Refreshing dashboard" : "Refresh dashboard"}
        >
          <RefreshCw
            className={refreshing ? "animate-spin motion-reduce:animate-none" : ""}
            aria-hidden="true"
          />
          {refreshing ? "Refreshing" : "Refresh"}
        </Button>
      }
    />
  );
}
