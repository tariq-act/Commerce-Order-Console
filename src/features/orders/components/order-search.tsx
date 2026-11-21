import type { RefObject } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function OrderSearch({
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
      <label htmlFor="order-search" className="sr-only">
        Search orders by reference
      </label>
      <Search
        className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id="order-search"
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by order reference…"
        autoComplete="off"
        maxLength={200}
        className="pr-11 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value.length > 0 && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-0.5 right-0.5"
          aria-label="Clear order search"
          onClick={() => {
            onClear();
            inputRef.current?.focus();
          }}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
