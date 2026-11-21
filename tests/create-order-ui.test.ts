import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateOrderForm } from "../src/features/orders/components/create-order-form";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { products } from "../src/db/schema";
import type { Database } from "../src/db/types";
import { apiPost, ApiClientError } from "../src/lib/api-client";
import { productsSchema, type CatalogueProduct } from "../src/features/products/types/product";
import {
  addProduct,
  setQuantity as setCartQuantity,
  resolveCart,
  cartTotals,
  orderPayload,
  type CartEntry,
} from "../src/features/orders/cart";
import { createdOrderSchema } from "../src/features/orders/types/order";
import { orderErrorMessage } from "../src/features/orders/hooks/use-create-order";
import { OrderCart } from "../src/features/orders/components/order-cart";
import { OrderConfirmation } from "../src/features/orders/components/order-confirmation";

let db: Database;
let directory: string;
let catalog: CatalogueProduct[];
let post: typeof import("../src/app/api/orders/route").POST;
const originalPath = process.env.DATABASE_PATH;
before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-create-order-ui-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
    env: process.env,
    stdio: "pipe",
  });
  catalog = productsSchema.parse(JSON.parse(JSON.stringify(db.select().from(products).all())));
  ({ POST: post } = await import("../src/app/api/orders/route"));
});
beforeEach(() => {
  db.$client.exec("DELETE FROM inventory_movements; DELETE FROM order_items; DELETE FROM orders;");
  for (const product of catalog)
    db.update(products)
      .set({ stock: product.stock, priceCents: product.priceCents })
      .where(eq(products.id, product.id))
      .run();
});
after(() => {
  db?.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalPath;
});
function capturePost(t: TestContext) {
  return t.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
    assert.equal(path, "/api/orders");
    assert.equal(options.method, "POST");
    return post(new Request(`http://localhost${path}`, options));
  });
}
function cart() {
  return addProduct(addProduct([], catalog[0]), catalog[1]);
}

test("cart supports multiple products and merges repeat additions into one entry", () => {
  let entries = cart();
  entries = addProduct(entries, catalog[0]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].quantity, 2);
  assert.equal(entries[1].quantity, 1);
});
test("quantity updates remain positive whole numbers within current stock", () => {
  const entries = cart();
  for (const quantity of [0, -1, 1.5, NaN, Infinity, catalog[0].stock + 1])
    assert.equal(setCartQuantity(entries, catalog[0], quantity), entries);
  assert.equal(setCartQuantity(entries, catalog[0], 3)[0].quantity, 3);
  assert.equal(
    setCartQuantity(setCartQuantity(entries, catalog[0], 3), catalog[0], 2)[0].quantity,
    2,
  );
});
test("out-of-stock products cannot be added and repeated additions stop at available stock", () => {
  assert.deepEqual(
    addProduct(
      [],
      catalog.find((p) => p.stock === 0)!,
    ),
    [],
  );
  let entries: CartEntry[] = [];
  const product = catalog.find((p) => p.sku === "ACC-004")!;
  for (let index = 0; index < product.stock + 3; index++) entries = addProduct(entries, product);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].quantity, product.stock);
});
test("cart quantities, line amounts and total are exact integer paise", () => {
  const entries = addProduct(cart(), catalog[0]);
  assert.deepEqual(cartTotals(entries), {
    totalCents: 409700,
    itemCount: 3,
    subtotals: [159800, 249900],
  });
  assert.deepEqual(cartTotals([]), { totalCents: 0, itemCount: 0, subtotals: [] });
  assert.equal(
    cartTotals([{ product: { ...catalog[0], priceCents: Number.MAX_SAFE_INTEGER }, quantity: 2 }]),
    null,
  );
});
test("inventory refresh keeps cart quantities and marks missing or reduced stock without discarding entries", () => {
  const entries = addProduct(cart(), catalog[0]);
  const current = [{ ...catalog[0], stock: 1 }];
  const resolved = resolveCart(entries, current);
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].quantity, 2);
  assert.equal(resolved[0].product.stock, 1);
  assert.equal(resolved[1].missing, true);
  assert.equal(entries[0].product.stock, 25);
});
test("request payload contains only IDs and quantities", () => {
  assert.deepEqual(orderPayload(cart()), {
    items: [
      { productId: catalog[0].id, quantity: 1 },
      { productId: catalog[1].id, quantity: 1 },
    ],
  });
  assert.doesNotMatch(JSON.stringify(orderPayload(cart())), /price|stock|sku|name/i);
});
test("quantity controls expose accessible names and checkout is disabled for an empty cart", () => {
  const markup = renderToStaticMarkup(
    createElement(OrderCart, {
      items: [],
      totals: cartTotals([]),
      locked: false,
      disabled: true,
      onQuantity: () => {},
      onRemove: () => {},
    }),
  );
  assert.match(markup, /Your cart is empty/);
  assert.match(markup, /disabled=""[^>]*>[\s\S]*?Place order/);
  const items = resolveCart(cart(), catalog);
  const filled = renderToStaticMarkup(
    createElement(OrderCart, {
      items,
      totals: cartTotals(items),
      locked: false,
      disabled: false,
      onQuantity: () => {},
      onRemove: () => {},
    }),
  );
  assert.match(filled, /Increase quantity of Wireless Mouse/);
  assert.match(filled, /Decrease quantity of Wireless Mouse/);
  assert.match(filled, /Remove Wireless Mouse from cart/);
  assert.match(filled, /₹3,298\.00/);
});
test("pending cart locks every quantity/removal button and checkout", () => {
  const items = resolveCart(cart(), catalog);
  const html = renderToStaticMarkup(
    createElement(OrderCart, {
      items,
      totals: cartTotals(items),
      locked: true,
      disabled: true,
      onQuantity: () => {},
      onRemove: () => {},
    }),
  );
  assert.match(html, /Placing order/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 7);
});
test("client creates a real multi-product order and accepts the exact POST response contract", async (t) => {
  capturePost(t);
  const entries = addProduct(cart(), catalog[0]);
  const order = await apiPost("/api/orders", orderPayload(entries), createdOrderSchema);
  assert.equal(order.totalCents, 409700);
  assert.equal(order.status, "PLACED");
  assert.equal(order.items.length, 2);
  assert.equal(db.select().from(products).where(eq(products.id, catalog[0].id)).get()!.stock, 23);
  const html = renderToStaticMarkup(
    createElement(OrderConfirmation, { order, onAnother: () => {} }),
  );
  assert.ok(html.includes(order.reference));
  assert.ok(html.includes(`href="/orders/${order.id}"`));
  assert.match(html, /₹4,097\.00/);
});
test("backend reprices from the database rather than trusting the cart preview", async (t) => {
  capturePost(t);
  const entries = addProduct([], catalog[0]);
  db.update(products).set({ priceCents: 12345 }).where(eq(products.id, catalog[0].id)).run();
  const order = await apiPost("/api/orders", orderPayload(entries), createdOrderSchema);
  assert.equal(cartTotals(entries)!.totalCents, 79900);
  assert.equal(order.totalCents, 12345);
  assert.equal(order.items[0].unitPriceCents, 12345);
});
test("409 preserves the cart and the backend leaves all products and order history unchanged", async (t) => {
  capturePost(t);
  const entries = cart();
  const before = JSON.stringify(entries);
  db.update(products).set({ stock: 0 }).where(eq(products.id, catalog[1].id)).run();
  await assert.rejects(
    apiPost("/api/orders", orderPayload(entries), createdOrderSchema),
    (error) =>
      error instanceof ApiClientError &&
      error.status === 409 &&
      error.code === "INSUFFICIENT_STOCK",
  );
  assert.equal(JSON.stringify(entries), before);
  assert.equal(
    (db.$client.prepare("SELECT count(*) count FROM orders").get() as { count: number }).count,
    0,
  );
  assert.equal(db.select().from(products).where(eq(products.id, catalog[0].id)).get()!.stock, 25);
});
test("400 and 404 errors are distinguishable and do not become false confirmations", async (t) => {
  capturePost(t);
  await assert.rejects(
    apiPost(
      "/api/orders",
      { items: [{ productId: catalog[0].id, quantity: 0 }] },
      createdOrderSchema,
    ),
    (error) => error instanceof ApiClientError && error.status === 400,
  );
  await assert.rejects(
    apiPost("/api/orders", { items: [{ productId: 999999, quantity: 1 }] }, createdOrderSchema),
    (error) => error instanceof ApiClientError && error.status === 404,
  );
  assert.match(orderErrorMessage(new ApiClientError("", 400)), /Review quantities/);
  assert.match(orderErrorMessage(new ApiClientError("", 404)), /Remove unavailable/);
});
test("network failures and unreadable confirmations preserve an uncertain outcome and never auto-retry", async (t) => {
  let calls = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new TypeError("offline private diagnostic");
  });
  await assert.rejects(
    apiPost("/api/orders", orderPayload(cart()), createdOrderSchema),
    (error) =>
      error instanceof ApiClientError && error.outcomeUnknown && !error.message.includes("private"),
  );
  assert.equal(calls, 1);
  fetch.mock.mockImplementation(
    async () => new Response("<html>private proxy diagnostic</html>", { status: 201 }),
  );
  await assert.rejects(
    apiPost("/api/orders", orderPayload(cart()), createdOrderSchema),
    (error) => error instanceof ApiClientError && error.outcomeUnknown,
  );
  assert.match(
    orderErrorMessage(new ApiClientError("", undefined, undefined, true)),
    /Check all orders/,
  );
});
test("unexpected server responses hide diagnostics and mismatched totals cannot clear a cart", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("private SQL error", { status: 500 }),
  );
  await assert.rejects(
    apiPost("/api/orders", orderPayload(cart()), createdOrderSchema),
    (error) =>
      error instanceof ApiClientError && error.status === 500 && !error.message.includes("SQL"),
  );
  fetch.mock.mockImplementation(async () =>
    Response.json(
      {
        success: true,
        data: {
          id: 1,
          reference: "ORD-CHECK",
          status: "PLACED",
          items: [{ productId: 1, productName: "test fixture", quantity: 2, unitPriceCents: 100 }],
          totalCents: 100,
          createdAt: new Date().toISOString(),
        },
      },
      { status: 201 },
    ),
  );
  await assert.rejects(
    apiPost("/api/orders", orderPayload(cart()), createdOrderSchema),
    (error) => error instanceof ApiClientError && error.outcomeUnknown,
  );
});

test("product search stays outside the checkout form so Enter cannot place an order", () => {
  const client = new QueryClient();
  client.setQueryData(["products", "list", {}], catalog);
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(CreateOrderForm)),
  );
  const formStart = html.indexOf("<form");
  const formEnd = html.indexOf("</form>");
  assert.ok(formStart > 0);
  assert.ok(html.indexOf('id="product-search"') < formStart);
  assert.ok(!html.slice(formStart, formEnd).includes('id="product-search"'));
  assert.ok(html.slice(formStart, formEnd).includes('type="submit"'));
  client.clear();
});

test("decreasing after a stock drop recovers to the new limit and zero stock is never accepted", () => {
  const entries = setCartQuantity(addProduct([], catalog[0]), catalog[0], 5);
  const reduced = { ...catalog[0], stock: 2 };
  assert.equal(setCartQuantity(entries, reduced, 4)[0].quantity, 2);
  assert.equal(setCartQuantity(entries, reduced, 6), entries);
  assert.equal(setCartQuantity(entries, { ...reduced, stock: 0 }, 4), entries);
});
