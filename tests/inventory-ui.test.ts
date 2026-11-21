import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, beforeEach, after, test, type TestContext } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { products } from "../src/db/schema";
import type { Database, Product } from "../src/db/types";
import { apiGet, apiPost, ApiClientError } from "../src/lib/api-client";
import { productQuerySchema } from "../src/lib/validations/product";
import {
  inventoryApiPath,
  movementQueryOptions,
} from "../src/features/inventory/hooks/use-inventory";
import {
  inventorySchema,
  inventoryProductSchema,
  movementPageSchema,
  inventoryStockStatus,
  filterInventory,
  type InventoryProduct,
} from "../src/features/inventory/types/inventory";
import { InventoryConsole } from "../src/features/inventory/components/inventory-console";
import { InventoryTable } from "../src/features/inventory/components/inventory-table";
import { InventoryStockBadge } from "../src/features/inventory/components/inventory-stock-badge";
import { MovementHistoryTable } from "../src/features/inventory/components/inventory-history";
import { createdOrderSchema } from "../src/features/orders/types/order";
import { submitOrderAction } from "../src/features/orders/actions";
import { refreshOrderCaches } from "../src/features/orders/hooks/use-order-details";
import InventoryPage from "../src/app/(dashboard)/inventory/page";

let db: Database;
let directory: string;
let catalog: Product[];
let service: typeof import("../src/services/order.service");
let list: typeof import("../src/app/api/inventory/route").GET;
let detail: typeof import("../src/app/api/inventory/[productId]/route").GET;
let movements: typeof import("../src/app/api/inventory/[productId]/movements/route").GET;
let create: typeof import("../src/app/api/orders/route").POST;
let cancel: typeof import("../src/app/api/orders/[id]/cancel/route").POST;
const originalPath = process.env.DATABASE_PATH;
before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-inventory-ui-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
    env: process.env,
    stdio: "pipe",
  });
  catalog = db.select().from(products).all();
  service = await import("../src/services/order.service");
  ({ GET: list } = await import("../src/app/api/inventory/route"));
  ({ GET: detail } = await import("../src/app/api/inventory/[productId]/route"));
  ({ GET: movements } = await import("../src/app/api/inventory/[productId]/movements/route"));
  ({ POST: create } = await import("../src/app/api/orders/route"));
  ({ POST: cancel } = await import("../src/app/api/orders/[id]/cancel/route"));
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
function routeFetch(t: TestContext) {
  return t.mock.method(globalThis, "fetch", async (path: string, options?: RequestInit) => {
    const url = new URL(path, "http://localhost");
    const request = new Request(url, options);
    const id = url.pathname.split("/")[3];
    if (url.pathname === "/api/orders") return create(request);
    if (url.pathname.endsWith("/cancel"))
      return cancel(request, { params: Promise.resolve({ id }) });
    if (url.pathname === "/api/inventory") return list(request);
    const context = { params: Promise.resolve({ productId: id }) };
    return url.pathname.endsWith("/movements")
      ? movements(request, context)
      : detail(request, context);
  });
}
function state() {
  return ["products", "orders", "order_items", "inventory_movements"].map((table) =>
    db.$client.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
  );
}
function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
  });
}
function render(component: ReturnType<typeof createElement>, queryClient = client()) {
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client: queryClient }, component),
  );
  queryClient.clear();
  return html;
}
function listOptions() {
  return {
    queryKey: ["inventory", "list", {}],
    queryFn: () => apiGet("/api/inventory", inventorySchema),
  };
}

test("inventory reads the configured low-stock threshold at request time", () => {
  const original = process.env.DASHBOARD_LOW_STOCK_THRESHOLD;
  try {
    delete process.env.DASHBOARD_LOW_STOCK_THRESHOLD;
    assert.equal(InventoryPage().props.threshold, 5);
    for (const threshold of [8, 0]) {
      process.env.DASHBOARD_LOW_STOCK_THRESHOLD = String(threshold);
      assert.equal(InventoryPage().props.threshold, threshold);
    }
    process.env.DASHBOARD_LOW_STOCK_THRESHOLD = "-1";
    assert.throws(() => InventoryPage());
  } finally {
    if (original === undefined) delete process.env.DASHBOARD_LOW_STOCK_THRESHOLD;
    else process.env.DASHBOARD_LOW_STOCK_THRESHOLD = original;
  }
});

test("all six inventory records load from the actual list contract", async (t) => {
  routeFetch(t);
  const data = await apiGet(inventoryApiPath({}), inventorySchema);
  assert.equal(data.length, 6);
  assert.equal(data.find((product) => product.sku === "ACC-001")?.stock, 25);
  assert.equal(data.find((product) => product.sku === "ACC-005")?.stock, 0);
});
test("name and SKU search combine with stock filters through safely encoded existing query parameters", async (t) => {
  routeFetch(t);
  for (const [query, sku] of [
    [{ search: "mouse" }, "ACC-001"],
    [{ search: "ACC-005", stock: "out_of_stock" as const }, "ACC-005"],
  ] as const) {
    const result = await apiGet(inventoryApiPath(query), inventorySchema);
    assert.deepEqual(
      result.map((product) => product.sku),
      [sku],
    );
  }
  assert.deepEqual(
    await apiGet(inventoryApiPath({ search: "not-a-product", stock: "in_stock" }), inventorySchema),
    [],
  );
  const path = new URL(
    inventoryApiPath({ search: "ACC-001 & ?", stock: "in_stock" }),
    "http://localhost",
  );
  assert.equal(path.searchParams.get("search"), "ACC-001 & ?");
  assert.equal(path.pathname, "/api/inventory");
  assert.equal(productQuerySchema.safeParse({ search: "x".repeat(201) }).success, false);
});
test("stock status is exclusive, includes the threshold boundary, and supports custom or zero thresholds", async (t) => {
  routeFetch(t);
  assert.deepEqual(
    [0, 1, 5, 6].map((stock) => inventoryStockStatus(stock, 5)),
    ["out_of_stock", "low_stock", "low_stock", "in_stock"],
  );
  const data = await apiGet("/api/inventory", inventorySchema);
  db.update(products).set({ stock: 5 }).where(eq(products.id, data[0].id)).run();
  const current = await apiGet(inventoryApiPath({ stock: "in_stock" }), inventorySchema);
  assert.equal(filterInventory(current, "low_stock", 5).length, 1);
  assert.equal(filterInventory(current, "in_stock", 5).length, 4);
  assert.equal(filterInventory(data, "out_of_stock", 5).length, 1);
  assert.equal(filterInventory(data, "low_stock", 8).length, 1);
  assert.equal(filterInventory(data, "low_stock", 0).length, 0);
  assert.equal(filterInventory(data, "all", 5), data);
  for (const [stock, label] of [
    [0, "Out of stock"],
    [5, "Low stock"],
    [6, "In stock"],
  ] as const)
    assert.ok(
      renderToStaticMarkup(createElement(InventoryStockBadge, { stock, threshold: 5 })).includes(
        label,
      ),
    );
});
test("individual inventory and no-history responses use the existing detail and movement endpoints", async (t) => {
  routeFetch(t);
  const product = await apiGet(`/api/inventory/${catalog[0].id}`, inventoryProductSchema);
  assert.equal(product.stock, 25);
  const data = await client().fetchQuery(movementQueryOptions(product.id, { page: 1, limit: 20 }));
  assert.deepEqual(data.movements, []);
  assert.deepEqual(data.pagination, { page: 1, limit: 20, total: 0, totalPages: 0 });
  assert.deepEqual(data.product, product);
});
test("order placement and cancellation refresh cached stock, details, and history exactly once", async (t) => {
  routeFetch(t);
  const queryClient = client();
  const historyOptions = movementQueryOptions(catalog[0].id, { page: 1, limit: 20 });
  const detailOptions = {
    queryKey: ["inventory", "detail", catalog[0].id],
    queryFn: () => apiGet(`/api/inventory/${catalog[0].id}`, inventoryProductSchema),
  };
  assert.equal((await queryClient.fetchQuery(listOptions()))[0].stock, 25);
  await queryClient.fetchQuery(detailOptions);
  await queryClient.fetchQuery(historyOptions);
  const order = await apiPost(
    "/api/orders",
    { items: [{ productId: catalog[0].id, quantity: 3 }] },
    createdOrderSchema,
  );
  refreshOrderCaches(queryClient);
  assert.equal((await queryClient.fetchQuery(listOptions()))[0].stock, 22);
  assert.equal((await queryClient.fetchQuery(detailOptions)).stock, 22);
  const placed = await queryClient.fetchQuery(historyOptions);
  assert.deepEqual(
    placed.movements.map((m) => [m.type, m.quantity, m.orderReference]),
    [["ORDER_PLACED", 3, order.reference]],
  );
  await submitOrderAction(order.id, "CANCELLED");
  refreshOrderCaches(queryClient);
  assert.equal((await queryClient.fetchQuery(listOptions()))[0].stock, 25);
  assert.equal((await queryClient.fetchQuery(detailOptions)).stock, 25);
  const cancelled = await queryClient.fetchQuery(historyOptions);
  assert.deepEqual(
    cancelled.movements.map((m) => [m.type, m.quantity]),
    [
      ["ORDER_CANCELLED", 3],
      ["ORDER_PLACED", 3],
    ],
  );
  await assert.rejects(
    submitOrderAction(order.id, "CANCELLED"),
    (error: unknown) => error instanceof ApiClientError && error.status === 409,
  );
  assert.equal(
    (await apiGet(`/api/inventory/${catalog[0].id}/movements`, movementPageSchema)).pagination
      .total,
    2,
  );
  queryClient.clear();
});
test("last movement uses limit one; paginated history covers all rows newest first", async (t) => {
  routeFetch(t);
  for (let index = 0; index < 11; index++) {
    const order = service.createOrder({ items: [{ productId: catalog[0].id, quantity: 1 }] });
    service.cancelOrder(String(order.id));
  }
  const queryClient = client();
  const latest = await queryClient.fetchQuery(
    movementQueryOptions(catalog[0].id, { page: 1, limit: 1 }),
  );
  const first = await queryClient.fetchQuery(
    movementQueryOptions(catalog[0].id, { page: 1, limit: 20 }),
  );
  const second = await queryClient.fetchQuery(
    movementQueryOptions(catalog[0].id, { page: 2, limit: 20 }),
  );
  assert.deepEqual(first.pagination, { page: 1, limit: 20, total: 22, totalPages: 2 });
  assert.equal(first.movements.length, 20);
  assert.equal(second.movements.length, 2);
  assert.deepEqual(latest.movements, first.movements.slice(0, 1));
  const ids = [...first.movements, ...second.movements].map((m) => m.id);
  assert.equal(new Set(ids).size, 22);
  assert.deepEqual(
    ids,
    [...ids].sort((a, b) => b - a),
  );
  queryClient.clear();
});
test("movement table renders signed quantities, real references, order links, dates and times", async (t) => {
  routeFetch(t);
  const order = service.createOrder({ items: [{ productId: catalog[0].id, quantity: 2 }] });
  service.cancelOrder(String(order.id));
  const data = await apiGet(`/api/inventory/${catalog[0].id}/movements`, movementPageSchema);
  const html = renderToStaticMarkup(createElement(MovementHistoryTable, { data }));
  for (const text of [
    "Order placed",
    "Order cancelled",
    "−2",
    "+2",
    order.reference,
    `/orders/${order.id}`,
    "Date · IST",
    "dateTime=",
  ])
    assert.ok(html.includes(text), text);
});
test("inventory table displays cached latest movements and genuine no-history records", async (t) => {
  routeFetch(t);
  const data = await apiGet("/api/inventory", inventorySchema);
  const order = service.createOrder({ items: [{ productId: catalog[0].id, quantity: 2 }] });
  const queryClient = client();
  for (const product of data)
    await queryClient.fetchQuery(movementQueryOptions(product.id, { page: 1, limit: 1 }));
  const html = render(
    createElement(InventoryTable, { products: data, threshold: 5, onView: () => {} }),
    queryClient,
  );
  for (const text of [
    "Wireless Mouse",
    "ACC-001",
    "Current stock",
    "Stock status",
    "No movements yet",
    "−2",
    "View inventory history for Wireless Mouse",
  ])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /adjust stock|delete product/i);
  assert.ok(order.id > 0);
});
test("inventory GET requests never change stock, orders, items or movement records", async (t) => {
  routeFetch(t);
  const order = service.createOrder({ items: [{ productId: catalog[0].id, quantity: 2 }] });
  service.cancelOrder(String(order.id));
  const before = state();
  for (let index = 0; index < 2; index++) {
    await apiGet("/api/inventory", inventorySchema);
    await apiGet(`/api/inventory/${catalog[0].id}`, inventoryProductSchema);
    await apiGet(`/api/inventory/${catalog[0].id}/movements`, movementPageSchema);
  }
  assert.deepEqual(state(), before);
});
test("loading, empty, failure and retry states are explicit without exposing server internals", async (t) => {
  routeFetch(t);
  assert.match(render(createElement(InventoryConsole, { threshold: 5 })), /Loading products/);
  const empty = client();
  empty.setQueryData(["inventory", "list", {}], []);
  assert.match(
    render(createElement(InventoryConsole, { threshold: 5 }), empty),
    /No inventory yet/,
  );
  const failed = client();
  failed
    .getQueryCache()
    .build(failed, { queryKey: ["inventory", "list", {}] })
    .setState({
      status: "error",
      fetchStatus: "idle",
      error: new ApiClientError("PRIVATE DATABASE DETAILS", 500),
    });
  const html = render(createElement(InventoryConsole, { threshold: 5 }), failed);
  assert.match(html, /Inventory is unavailable/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /PRIVATE DATABASE DETAILS/);
  const failedLatest = client();
  const data = await apiGet("/api/inventory", inventorySchema);
  failedLatest
    .getQueryCache()
    .build(failedLatest, {
      queryKey: movementQueryOptions(data[0].id, { page: 1, limit: 1 }).queryKey,
    })
    .setState({ status: "error", fetchStatus: "idle", error: new ApiClientError("private", 500) });
  const table = render(
    createElement(InventoryTable, { products: data.slice(0, 1), threshold: 5, onView: () => {} }),
    failedLatest,
  );
  assert.match(table, /Unavailable/);
  assert.match(table, /Retry latest movement for Wireless Mouse/);
});
test("invalid IDs, missing products and invalid movement pagination are rejected by the actual API", async (t) => {
  routeFetch(t);
  for (const [id, status] of [
    ["0", 400],
    ["wrong", 400],
    ["9007199254740992", 400],
    ["999999", 404],
  ] as const)
    await assert.rejects(
      apiGet(`/api/inventory/${id}`, inventoryProductSchema),
      (error: unknown) => error instanceof ApiClientError && error.status === status,
    );
  for (const query of ["page=0", "limit=101", "page=1.5", "page=1&page=2"])
    await assert.rejects(
      apiGet(`/api/inventory/${catalog[0].id}/movements?${query}`, movementPageSchema),
      (error: unknown) => error instanceof ApiClientError && error.status === 400,
    );
});
test("malformed stock and history responses are rejected before entering caches", async (t) => {
  routeFetch(t);
  const product: InventoryProduct = (await apiGet("/api/inventory", inventorySchema))[0];
  assert.equal(inventoryProductSchema.safeParse({ ...product, stock: -1 }).success, false);
  const history = await apiGet(`/api/inventory/${product.id}/movements`, movementPageSchema);
  assert.equal(
    movementPageSchema.safeParse({
      ...history,
      pagination: { ...history.pagination, totalPages: 10 },
    }).success,
    false,
  );
  assert.equal(
    movementPageSchema.safeParse({
      ...history,
      movements: [
        {
          id: 1,
          productId: product.id,
          orderId: 1,
          orderReference: "ORD",
          type: "ORDER_PLACED",
          quantity: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    }).success,
    false,
  );
});
