import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test, type TestContext } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { products } from "../src/db/schema";
import type { Database } from "../src/db/types";
import type { CreatedOrder } from "../src/services/order.service";
import { apiGet, ApiClientError } from "../src/lib/api-client";
import {
  parseOrderFilters,
  orderListHref,
  ordersApiPath,
} from "../src/features/orders/list-params";
import {
  orderPageSchema,
  orderDetailsSchema,
  orderItemCount,
  orderStatusValues,
} from "../src/features/orders/types/order";
import { OrdersTable } from "../src/features/orders/components/orders-table";
import { OrdersPagination } from "../src/features/orders/components/orders-pagination";

let db: Database;
let directory: string;
let fixtures: CreatedOrder[];
let list: typeof import("../src/app/api/orders/route").GET;
let detail: typeof import("../src/app/api/orders/[id]/route").GET;
const originalPath = process.env.DATABASE_PATH;
before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-orders-list-ui-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
    env: process.env,
    stdio: "pipe",
  });
  const catalog = db.select().from(products).all();
  db.update(products).set({ stock: 100 }).where(eq(products.id, catalog[0].id)).run();
  const service = await import("../src/services/order.service");
  fixtures = Array.from({ length: 24 }, (_, index) => {
    const order = service.createOrder({
      items:
        index === 0
          ? [
              { productId: catalog[0].id, quantity: 2 },
              { productId: catalog[1].id, quantity: 1 },
            ]
          : [{ productId: catalog[0].id, quantity: 1 }],
    });
    if (index % 4 === 1 || index % 4 === 2)
      service.updateOrderStatus(String(order.id), { status: "PACKED" });
    if (index % 4 === 2) service.updateOrderStatus(String(order.id), { status: "SHIPPED" });
    if (index % 4 === 3) service.cancelOrder(String(order.id));
    return order;
  });
  ({ GET: list } = await import("../src/app/api/orders/route"));
  ({ GET: detail } = await import("../src/app/api/orders/[id]/route"));
});
after(() => {
  db?.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalPath;
});
function filters(query = "") {
  const parsed = parseOrderFilters(new URLSearchParams(query));
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}
function routeFetch(t: TestContext) {
  return t.mock.method(globalThis, "fetch", async (path: string, options?: RequestInit) => {
    const url = new URL(path, "http://localhost");
    if (url.pathname === "/api/orders") return list(new Request(url, options));
    return detail(new Request(url, options), {
      params: Promise.resolve({ id: url.pathname.split("/").at(-1)! }),
    });
  });
}
async function page(query = "") {
  const response = await list(new Request(`http://localhost${ordersApiPath(filters(query))}`));
  assert.equal(response.status, 200);
  return orderPageSchema.parse((await response.json()).data);
}

test("order URL parsing uses the API defaults and rejects invalid or repeated values", () => {
  assert.deepEqual(filters(), { page: 1, limit: 20 });
  assert.deepEqual(filters("search=%20ref%20&status=PACKED&page=2&limit=5"), {
    search: "ref",
    status: "PACKED",
    page: 2,
    limit: 5,
  });
  for (const query of [
    "page=0",
    "page=-1",
    "page=1.5",
    "limit=0",
    "limit=101",
    "status=INVALID",
    "status=PLACED&status=PACKED",
    "page=1&page=2",
    "search=a&search=b",
    `search=${"a".repeat(201)}`,
    "page=9007199254740991&limit=100",
  ]) {
    assert.equal(parseOrderFilters(new URLSearchParams(query)).success, false, query);
  }
});
test("page navigation preserves search, status and page size; filter edits reset page one", () => {
  const current = new URL("http://localhost/orders?search=ORD&status=PACKED&page=3&limit=5");
  const next = new URL(orderListHref(current, { page: "4" }), current);
  assert.equal(next.searchParams.get("search"), "ORD");
  assert.equal(next.searchParams.get("status"), "PACKED");
  assert.equal(next.searchParams.get("limit"), "5");
  assert.equal(next.searchParams.get("page"), "4");
  for (const update of [{ search: "mouse" }, { status: "SHIPPED" }, { limit: "10" }]) {
    assert.equal(new URL(orderListHref(next, update), next).searchParams.has("page"), false);
  }
  const statusChanged = new URL(orderListHref(next, { status: "CANCELLED" }), next);
  const delayedSearch = new URL(orderListHref(statusChanged, { search: "new reference" }), next);
  assert.equal(delayedSearch.searchParams.get("status"), "CANCELLED");
  assert.equal(delayedSearch.searchParams.get("search"), "new reference");
  assert.equal(delayedSearch.searchParams.get("limit"), "5");
});
test("clearing search retains status and query encoding keeps references literal", () => {
  const current = new URL("http://localhost/orders?search=ORD&status=SHIPPED&page=3&limit=5");
  const cleared = new URL(orderListHref(current, { search: null }), current);
  assert.equal(cleared.searchParams.get("status"), "SHIPPED");
  assert.equal(cleared.searchParams.has("page"), false);
  const api = new URL(
    ordersApiPath({ page: 1, limit: 20, search: "ORD-% & ?", status: "PLACED" }),
    current,
  );
  assert.equal(api.searchParams.get("search"), "ORD-% & ?");
});
test("all real orders load through the existing paginated envelope without fetching every page", async (t) => {
  routeFetch(t);
  const data = await apiGet(ordersApiPath(filters()), orderPageSchema);
  assert.equal(data.orders.length, 20);
  assert.deepEqual(data.pagination, { page: 1, limit: 20, total: 24, totalPages: 2 });
  assert.deepEqual(
    data.orders.map((order) => order.id),
    fixtures
      .slice(-20)
      .reverse()
      .map((order) => order.id),
  );
});
test("reference search and no-match search use actual API responses", async () => {
  const reference = fixtures[0].reference;
  const found = await page(`search=${encodeURIComponent(reference)}`);
  assert.equal(found.pagination.total, 1);
  assert.equal(found.orders[0].reference, reference);
  const missing = await page("search=there-are-no-orders-with-this-reference");
  assert.deepEqual(missing.orders, []);
  assert.equal(missing.pagination.total, 0);
  assert.equal(missing.pagination.totalPages, 0);
});
test("each status filter matches the actual backend transitions", async () => {
  for (const status of orderStatusValues) {
    const data = await page(`status=${status}`);
    assert.equal(data.pagination.total, 6);
    assert.ok(data.orders.every((order) => order.status === status));
  }
});
test("reference and status filters combine and preserve matching totals across pages", async () => {
  let data = await page(`search=${encodeURIComponent(fixtures[0].reference)}&status=PLACED`);
  assert.equal(data.pagination.total, 1);
  data = await page(`search=${encodeURIComponent(fixtures[0].reference)}&status=SHIPPED`);
  assert.equal(data.pagination.total, 0);
  const first = await page("search=ORD&status=PACKED&limit=2");
  const second = await page("search=ORD&status=PACKED&limit=2&page=2");
  assert.equal(first.pagination.totalPages, 3);
  assert.equal(second.pagination.total, first.pagination.total);
  assert.equal(second.orders.length, 2);
  assert.ok(second.orders.every((order) => order.status === "PACKED"));
  assert.equal(new Set([...first.orders, ...second.orders].map((order) => order.id)).size, 4);
});
test("visible-page details yield exact total-unit counts and historical order prices", async (t) => {
  routeFetch(t);
  const order = await apiGet(`/api/orders/${fixtures[0].id}`, orderDetailsSchema);
  assert.equal(orderItemCount(order), 3);
  assert.equal(order.totalCents, 409700);
  const productId = order.items[0].productId;
  db.update(products).set({ priceCents: 1 }).where(eq(products.id, productId)).run();
  const after = await apiGet(`/api/orders/${fixtures[0].id}`, orderDetailsSchema);
  assert.deepEqual(after, order);
  assert.equal(orderItemCount(after), 3);
  assert.throws(
    () =>
      orderItemCount({
        items: [
          { ...order.items[0], quantity: Number.MAX_SAFE_INTEGER },
          { ...order.items[1], quantity: 1 },
        ],
      }),
    /integer range/,
  );
});
test("orders table renders cached real details, stored totals, statuses and details navigation", async (t) => {
  routeFetch(t);
  const data = await page(`search=${encodeURIComponent(fixtures[0].reference)}`);
  const details = await apiGet(`/api/orders/${fixtures[0].id}`, orderDetailsSchema);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["orders", "detail", details.id], details);
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(OrdersTable, { orders: data.orders }),
    ),
  );
  assert.ok(html.includes(fixtures[0].reference));
  assert.ok(html.includes(`href="/orders/${fixtures[0].id}"`));
  assert.match(html, /₹4,097\.00/);
  assert.match(html, />3</);
  assert.match(html, /Placed/);
  client.clear();
});
test("pagination handles last, empty and custom-size pages without invented totals", async () => {
  const data = await page("page=2&limit=20");
  let html = renderToStaticMarkup(
    createElement(OrdersPagination, {
      pagination: data.pagination,
      rowCount: data.orders.length,
      disabled: false,
      onPage: () => {},
      onLimit: () => {},
    }),
  );
  assert.match(html, /21–24 of 24 results/);
  assert.match(html, /Page <!-- -->2<!-- --> of 2|Page 2 of 2/);
  assert.match(html, /disabled=""[^>]*aria-label="Next orders page"/);
  const custom = await page("page=2&limit=3");
  html = renderToStaticMarkup(
    createElement(OrdersPagination, {
      pagination: custom.pagination,
      rowCount: custom.orders.length,
      disabled: false,
      onPage: () => {},
      onLimit: () => {},
    }),
  );
  assert.match(html, /4–6 of 24 results/);
  const empty = await page("search=no-match");
  html = renderToStaticMarkup(
    createElement(OrdersPagination, {
      pagination: empty.pagination,
      rowCount: 0,
      disabled: false,
      onPage: () => {},
      onLimit: () => {},
    }),
  );
  assert.match(html, /0 results/);
  assert.doesNotMatch(html, /of 0/);
});
test("out-of-range pages retain the API metadata for explicit recovery", async () => {
  const data = await page("page=99&limit=5");
  assert.deepEqual(data.orders, []);
  assert.deepEqual(data.pagination, { page: 99, limit: 5, total: 24, totalPages: 5 });
});
test("failed list or item-count reads never turn into fabricated zero values", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("private database path", { status: 500 }),
  );
  await assert.rejects(
    apiGet(ordersApiPath(filters()), orderPageSchema),
    (error) =>
      error instanceof ApiClientError && error.status === 500 && !error.message.includes("private"),
  );
  await assert.rejects(
    apiGet("/api/orders/1", orderDetailsSchema),
    (error) => error instanceof ApiClientError && error.status === 500,
  );
});
test("mismatched pagination contracts are rejected by the shared client", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      success: true,
      data: { orders: [], pagination: { page: 1, limit: 20, total: 24, totalPages: 1 } },
    }),
  );
  await assert.rejects(apiGet("/api/orders", orderPageSchema), /unexpected response/);
});
