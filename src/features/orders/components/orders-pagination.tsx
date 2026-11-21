import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/format";
import type { OrderPageResponse } from "../types/order";

export function OrdersPagination({
  pagination,
  rowCount,
  disabled,
  onPage,
  onLimit,
}: {
  pagination: OrderPageResponse["pagination"];
  rowCount: number;
  disabled: boolean;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  const { page, limit, total, totalPages } = pagination;
  const sizes = [...new Set([10, 20, 50, 100, limit])].sort((a, b) => a - b);
  const start = (page - 1) * limit + 1;
  return (
    <div className="flex flex-col gap-4 border-t border-border px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[0.8125rem] text-muted-foreground">
          {total === 0
            ? "0 results"
            : rowCount === 0
              ? `${formatNumber(total)} total results`
              : `${formatNumber(start)}–${formatNumber(start + rowCount - 1)} of ${formatNumber(total)} results`}
        </p>
        <div className="flex items-center gap-2.5">
          <label htmlFor="orders-page-size" className="text-xs text-muted-foreground">
            Per page
          </label>
          <Select
            value={String(limit)}
            onValueChange={(value) => onLimit(Number(value))}
            disabled={disabled}
          >
            <SelectTrigger id="orders-page-size" aria-label="Orders per page" className="h-9 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <nav
        aria-label="Orders pagination"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <p className="text-[0.8125rem] text-muted-foreground" aria-current="page">
          Page {formatNumber(page)}
          {totalPages > 0 ? ` of ${formatNumber(totalPages)}` : " · No results"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || page <= 1}
            aria-label="Previous orders page"
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || page >= totalPages}
            aria-label="Next orders page"
            onClick={() => onPage(page + 1)}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </nav>
    </div>
  );
}
