import { Search, X } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProductSearch({
  value,
  onChange,
  onClear,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative w-full sm:max-w-md">
      <label htmlFor="product-search" className="sr-only">
        Search products by name or SKU
      </label>
      <Search
        className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        id="product-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by name or SKU…"
        autoComplete="off"
        maxLength={200}
        className="pr-11 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value.length > 0 && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-0.5 right-0.5 size-9"
          aria-label="Clear product search"
          onClick={() => {
            onClear();
            inputRef.current?.focus();
          }}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
