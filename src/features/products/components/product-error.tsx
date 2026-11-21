import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProductError({
  title,
  description,
  retrying,
  onRetry,
}: {
  title: string;
  description: string;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-5 flex size-12 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}
