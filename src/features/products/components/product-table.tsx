import { ArrowUpRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { CatalogueProduct } from "../types/product";
import { ProductStatusBadge } from "./product-status-badge";

export function ProductTable({
  products,
  onView,
}: {
  products: CatalogueProduct[];
  onView: (id: number, trigger: HTMLElement) => void;
}) {
  return (
    <Table aria-label="Product catalogue" className="min-w-[1000px]">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Product name</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right whitespace-nowrap">Available stock</TableHead>
          <TableHead>Availability</TableHead>
          <TableHead className="pr-6 text-right">
            <span className="sr-only">Details</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            <TableCell className="pl-6">
              <div className="flex min-w-44 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/35">
                  <Package
                    className="size-[1.125rem] text-[#76728b]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="max-w-48 text-sm leading-6 font-medium break-words">
                  {product.name}
                </span>
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs font-medium text-muted-foreground">
              {product.sku}
            </TableCell>
            <TableCell>
              <p className="line-clamp-2 min-w-44 max-w-64 text-[0.8125rem] leading-5 text-muted-foreground break-words">
                {product.description || "No description provided."}
              </p>
            </TableCell>
            <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
              {formatCurrency(product.priceCents)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <span
                className={
                  product.stock === 0 ? "font-medium text-muted-foreground" : "font-medium"
                }
              >
                {formatNumber(product.stock)}
              </span>
              <span className="ml-1 text-xs text-muted-foreground">units</span>
            </TableCell>
            <TableCell>
              <ProductStatusBadge stock={product.stock} />
            </TableCell>
            <TableCell className="pr-6 text-right">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`View details for ${product.name}`}
                onClick={(event) => onView(product.id, event.currentTarget)}
              >
                View
                <ArrowUpRight aria-hidden="true" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
