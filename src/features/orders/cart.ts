import type { CatalogueProduct } from "@/features/products/types/product";
import type { CreateOrderRequest } from "./types/order";

export type CartEntry = { product: CatalogueProduct; quantity: number };
export type CartItem = CartEntry & { missing: boolean };
export function addProduct(entries: CartEntry[], product: CatalogueProduct): CartEntry[] {
  if (product.stock < 1) return entries;
  const current = entries.find((item) => item.product.id === product.id);
  if (!current) return [...entries, { product, quantity: 1 }];
  if (current.quantity >= product.stock) return entries;
  return entries.map((item) =>
    item.product.id === product.id ? { product, quantity: item.quantity + 1 } : item,
  );
}
export function setQuantity(
  entries: CartEntry[],
  product: CatalogueProduct,
  quantity: number,
): CartEntry[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || product.stock < 1) return entries;
  const current = entries.find((item) => item.product.id === product.id);
  if (!current) return entries;
  if (quantity > product.stock) {
    if (quantity >= current.quantity) return entries;
    // An explicit decrease can recover a cart whose stock dropped meanwhile.
    quantity = product.stock;
  }
  return entries.map((item) => (item.product.id === product.id ? { product, quantity } : item));
}
export function resolveCart(
  entries: CartEntry[],
  catalog: CatalogueProduct[] | undefined,
): CartItem[] {
  const current = new Map(catalog?.map((product) => [product.id, product]));
  return entries.map((item) => ({
    ...item,
    product: current.get(item.product.id) ?? item.product,
    missing: catalog !== undefined && !current.has(item.product.id),
  }));
}
export function cartTotals(items: CartEntry[]) {
  let total = BigInt(0);
  let count = BigInt(0);
  const subtotals: number[] = [];
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) return null;
    const line = BigInt(item.product.priceCents) * BigInt(item.quantity);
    total += line;
    count += BigInt(item.quantity);
    if (total > BigInt(Number.MAX_SAFE_INTEGER) || count > BigInt(Number.MAX_SAFE_INTEGER))
      return null;
    subtotals.push(Number(line));
  }
  return { totalCents: Number(total), itemCount: Number(count), subtotals };
}
export function orderPayload(items: CartEntry[]): CreateOrderRequest {
  return { items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity })) };
}
