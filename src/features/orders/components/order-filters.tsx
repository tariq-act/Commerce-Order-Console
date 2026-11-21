import type { RefObject } from "react";
import { Filter, X } from "lucide-react";
import type { OrderStatus } from "@/db/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orderStatusSchema, orderStatusValues } from "../types/order";
import { OrderSearch } from "./order-search";

export function OrderFilters({
  search,
  onSearch,
  onClearSearch,
  status,
  onStatus,
  hasFilters,
  onClear,
  inputRef,
}: {
  search: string;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  status: OrderStatus | "all";
  onStatus: (status: OrderStatus | "all") => void;
  hasFilters: boolean;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      role="search"
      aria-label="Filter orders"
      className="flex flex-col gap-3 border-b border-border px-5 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:px-6"
    >
      <OrderSearch value={search} onChange={onSearch} onClear={onClearSearch} inputRef={inputRef} />
      <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
        <div className="min-w-44 flex-1 sm:flex-none">
          <Select
            value={status}
            onValueChange={(value) => {
              const parsed = orderStatusSchema.safeParse(value);
              if (value === "all") onStatus("all");
              else if (parsed.success) onStatus(parsed.data);
            }}
          >
            <SelectTrigger aria-label="Filter by order status" className="gap-2 sm:w-48">
              <Filter className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {orderStatusValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {value[0] + value.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X aria-hidden="true" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
