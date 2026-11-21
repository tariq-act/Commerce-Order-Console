import type { RefObject } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StockFilter } from "../catalogue-params";
import { ProductSearch } from "./product-search";

export function ProductFilters({
  search,
  onSearch,
  onClearSearch,
  stock,
  onStock,
  hasFilters,
  onClear,
  inputRef,
}: {
  search: string;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  stock: StockFilter;
  onStock: (value: StockFilter) => void;
  hasFilters: boolean;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      role="search"
      aria-label="Filter product catalogue"
      className="flex flex-col gap-3 border-b border-border bg-white px-5 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:px-6"
    >
      <ProductSearch
        value={search}
        onChange={onSearch}
        onClear={onClearSearch}
        inputRef={inputRef}
      />
      <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
        <div className="min-w-44 flex-1 sm:flex-none">
          <Select
            value={stock}
            onValueChange={(value) => {
              if (value === "all" || value === "in_stock" || value === "out_of_stock")
                onStock(value);
            }}
          >
            <SelectTrigger aria-label="Filter by stock" className="gap-2 sm:w-48">
              <Filter className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="in_stock">In stock</SelectItem>
              <SelectItem value="out_of_stock">Out of stock</SelectItem>
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
