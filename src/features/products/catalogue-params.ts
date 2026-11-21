import {
  productIdParamsSchema,
  productQuerySchema,
  type ProductQuery,
} from "@/lib/validations/product";

export type StockFilter = "all" | "in_stock" | "out_of_stock";
type Parameters = Pick<URLSearchParams, "getAll">;

export function parseCatalogueFilters(parameters: Parameters) {
  const input: Record<string, string | string[]> = {};
  for (const key of ["search", "stock"]) {
    const values = parameters.getAll(key);
    if (values.length === 0) continue;
    if (values.length === 1 && key === "search" && values[0].trim() === "") continue;
    input[key] = values.length === 1 ? values[0] : values;
  }
  return productQuerySchema.safeParse(input);
}

export function parseSelectedProduct(parameters: Parameters) {
  const values = parameters.getAll("product");
  if (values.length === 0) return { selected: false, id: null } as const;
  const validation = productIdParamsSchema.safeParse({
    id: values.length === 1 ? values[0] : values,
  });
  return { selected: true, id: validation.success ? validation.data.id : null } as const;
}

export function productsApiPath(filters: ProductQuery) {
  const parameters = new URLSearchParams();
  if (filters.search) parameters.set("search", filters.search);
  if (filters.stock) parameters.set("stock", filters.stock);
  const query = parameters.toString();
  return `/api/products${query ? `?${query}` : ""}`;
}

// Read the latest URL at the time of an action so debounced search never
// overwrites a stock filter or selection made while the timer was pending.
export function updateCatalogueUrl(
  updates: Partial<Record<"search" | "stock" | "product", string | null>>,
  mode: "push" | "replace" = "replace",
) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}
