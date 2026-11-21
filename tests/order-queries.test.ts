import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { orders, orderStatuses, products } from "../src/db/schema";
import type { Database, Order, Product } from "../src/db/types";
import type { ApiError, ApiSuccess } from "../src/lib/api-response";
import type { OrderDetails, OrderPage, OrderSummary } from "../src/services/order-query.service";

type JsonSummary = Omit<OrderSummary, "createdAt"> & { createdAt: string };
type JsonPage = Omit<OrderPage, "orders"> & { orders: JsonSummary[] };
type JsonDetails = Omit<OrderDetails, "createdAt"> & { createdAt: string };
let db: Database;
let list: typeof import("../src/app/api/orders/route").GET;
let detail: typeof import("../src/app/api/orders/[id]/route").GET;
let directory: string;
let catalog: Product[];
let fixtures: Order[];
const originalDatabasePath = process.env.DATABASE_PATH;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-order-queries-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
    env: { ...process.env },
    stdio: "pipe",
  });
  catalog = db.select().from(products).orderBy(products.id).all();
  const { createOrder } = await import("../src/services/order.service");
  fixtures = Array.from({ length: 8 }, (_, index) => {
    const order = createOrder({
      items:
        index === 0
          ? [
              { productId: catalog[0].id, quantity: 2 },
              { productId: catalog[1].id, quantity: 1 },
            ]
          : [{ productId: catalog[0].id, quantity: 1 }],
    });
    // Fixture-only statuses and dates: no fulfilment/cancellation endpoints are used.
    const day = [1, 4, 3, 2, 5, 6, 7, 7][index];
    return db
      .update(orders)
      .set({
        reference: `ORD-READ-${String(index + 1).padStart(3, "0")}`,
        status: orderStatuses[index % orderStatuses.length],
        createdAt: new Date(Date.UTC(2026, 10, day)),
      })
      .where(eq(orders.id, order.id))
      .returning()
      .get();
  });
  ({ GET: list } = await import("../src/app/api/orders/route"));
  ({ GET: detail } = await import("../src/app/api/orders/[id]/route"));
});

after(() => {
  if (db?.$client.open) db.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabasePath;
});

function request(query = "") {
  return new Request(`http://localhost/api/orders${query}`);
}

async function listed(query = "") {
  const response = await list(request(query));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = (await response.json()) as ApiSuccess<JsonPage>;
  assert.equal(body.success, true);
  return body.data;
}

function fetched(id: string) {
  return detail(new Request(`http://localhost/api/orders/${encodeURIComponent(id)}`), {
    params: Promise.resolve({ id }),
  });
}

async function details(id: number) {
  const response = await fetched(String(id));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = (await response.json()) as ApiSuccess<JsonDetails>;
  assert.equal(body.success, true);
  return body.data;
}

test("lists all fixture orders, newest date first with descending ID ties", async () => {
  const result = await listed();
  assert.deepEqual(
    result.orders.map((order) => order.id),
    [7, 6, 5, 4, 1, 2, 3, 0].map((index) => fixtures[index].id),
  );
  assert.deepEqual(result.pagination, { page: 1, limit: 20, total: 8, totalPages: 1 });
  for (const row of result.orders) {
    const fixture = fixtures.find((order) => order.id === row.id)!;
    assert.deepEqual(row, {
      id: fixture.id,
      reference: fixture.reference,
      status: fixture.status,
      totalCents: fixture.totalCents,
      createdAt: fixture.createdAt.toISOString(),
    });
  }
});

test("searches complete and partial order references case-insensitively", async () => {
  const result = await listed("?search=%20ord-read-001%20");
  assert.deepEqual(
    result.orders.map((order) => order.id),
    [fixtures[0].id],
  );
  assert.equal((await listed("?search=read-00")).pagination.total, 8);
});

test("returns successful empty orders and zero matching counts for no match", async () => {
  assert.deepEqual(await listed("?search=nonexistent"), {
    orders: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
});

for (const status of orderStatuses) {
  test(`filters by ${status} and counts only matching orders`, async () => {
    const result = await listed(`?status=${status}`);
    assert.equal(result.orders.length, 2);
    assert.ok(result.orders.every((order) => order.status === status));
    assert.deepEqual(result.pagination, { page: 1, limit: 20, total: 2, totalPages: 1 });
  });
}

test("combines reference search and status with AND semantics", async () => {
  const result = await listed("?search=read-002&status=PACKED");
  assert.deepEqual(
    result.orders.map((order) => order.id),
    [fixtures[1].id],
  );
  assert.equal(result.pagination.total, 1);
  assert.deepEqual((await listed("?search=read-002&status=PLACED")).orders, []);
});

test("paginates filtered results and reports the filtered total", async () => {
  const result = await listed("?search=read-00&status=PACKED&page=2&limit=1");
  assert.deepEqual(
    result.orders.map((order) => order.id),
    [fixtures[1].id],
  );
  assert.deepEqual(result.pagination, { page: 2, limit: 1, total: 2, totalPages: 2 });
});

test("paginates without overlapping results and accepts the maximum limit", async () => {
  const first = await listed("?page=1&limit=3");
  const second = await listed("?page=2&limit=3");
  const third = await listed("?page=3&limit=3");
  assert.deepEqual([...first.orders, ...second.orders, ...third.orders], (await listed()).orders);
  assert.equal(new Set([...first.orders, ...second.orders].map((order) => order.id)).size, 6);
  assert.equal(third.orders.length, 2);
  assert.equal((await listed("?limit=100")).orders.length, 8);
});

test("applies the default limit of twenty when more than twenty orders exist", async () => {
  const additional = db
    .insert(orders)
    .values(
      Array.from({ length: 17 }, (_, index) => ({
        reference: `ORD-PAGINATION-${index}`,
        totalCents: 0,
      })),
    )
    .returning()
    .all();
  try {
    const first = await listed();
    assert.equal(first.orders.length, 20);
    assert.deepEqual(first.pagination, { page: 1, limit: 20, total: 25, totalPages: 2 });
    assert.equal((await listed("?page=2")).orders.length, 5);
  } finally {
    db.delete(orders)
      .where(
        inArray(
          orders.id,
          additional.map((order) => order.id),
        ),
      )
      .run();
  }
});

test("returns an empty page beyond the last page while retaining matching totals", async () => {
  assert.deepEqual(await listed("?page=9999&limit=2"), {
    orders: [],
    pagination: { page: 9999, limit: 2, total: 8, totalPages: 4 },
  });
});

test("retrieves a complete multi-item order with product names, SKUs, and paise subtotals", async () => {
  const result = await details(fixtures[0].id);
  assert.equal(result.reference, fixtures[0].reference);
  assert.equal(result.status, "PLACED");
  assert.equal(result.createdAt, fixtures[0].createdAt.toISOString());
  assert.equal(result.totalCents, 409700);
  assert.equal(result.items.length, 2);
  assert.deepEqual(
    result.items.map(
      ({ productId, productName, sku, quantity, unitPriceCents, subtotalCents }) => ({
        productId,
        productName,
        sku,
        quantity,
        unitPriceCents,
        subtotalCents,
      }),
    ),
    [
      {
        productId: catalog[0].id,
        productName: "Wireless Mouse",
        sku: "ACC-001",
        quantity: 2,
        unitPriceCents: 79900,
        subtotalCents: 159800,
      },
      {
        productId: catalog[1].id,
        productName: "Mechanical Keyboard",
        sku: "ACC-002",
        quantity: 1,
        unitPriceCents: 249900,
        subtotalCents: 249900,
      },
    ],
  );
  assert.equal(
    result.items.reduce((total, item) => total + item.subtotalCents, 0),
    result.totalCents,
  );
});

test("historical detail prices, subtotals, and stored totals survive current product price changes", async () => {
  const original = await details(fixtures[0].id);
  db.update(products).set({ priceCents: 1 }).run();
  try {
    assert.deepEqual(await details(fixtures[0].id), original);
    const result = await listed("?search=read-001");
    assert.equal(result.orders[0].totalCents, 409700);
  } finally {
    for (const product of catalog)
      db.update(products)
        .set({ priceCents: product.priceCents })
        .where(eq(products.id, product.id))
        .run();
  }
});

test("does not include another order's items in the requested details", async () => {
  const result = await details(fixtures[1].id);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, 1);
  assert.equal(result.items[0].subtotalCents, 79900);
  assert.equal(result.totalCents, 79900);
});

test("treats wildcard and SQL injection text as literal reference search", async () => {
  for (const search of ["%", "_", "' OR 1=1 --", "\\"]) {
    const result = await listed(`?search=${encodeURIComponent(search)}`);
    assert.deepEqual(result.orders, []);
    assert.equal(result.pagination.total, 0);
  }
  assert.equal((await listed()).pagination.total, 8);
});

test("returns consistent 404 JSON for a nonexistent order", async () => {
  const response = await fetched("999999");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "Order not found." },
  });
});

for (const query of [
  "?status=INVALID",
  "?status=placed",
  "?status=",
  "?status=PLACED&status=PACKED",
  "?page=0",
  "?page=-1",
  "?page=1.5",
  "?page=1e2",
  "?page=",
  "?page=Infinity",
  "?page=abc",
  "?page=9007199254740992",
  "?page=9007199254740991&limit=100",
  "?page=1&page=2",
  "?limit=0",
  "?limit=-1",
  "?limit=101",
  "?limit=1.5",
  "?limit=1e2",
  "?limit=",
  "?limit=abc",
  "?limit=20&limit=10",
  "?search=",
  "?search=%20%20",
  `?search=${"a".repeat(201)}`,
  "?search=read&search=another",
  "?unknown=value",
  "?__proto__=value",
  `?status=${encodeURIComponent("PLACED' OR 1=1 --")}`,
]) {
  test(`rejects invalid order query ${query.slice(0, 65)}`, async () => {
    const response = await list(request(query));
    assert.equal(response.status, 400);
    const body = (await response.json()) as ApiError;
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.details?.length);
  });
}

for (const id of ["abc", "0", "-1", "1.5", "1e2", "9007199254740992", "1 OR 1=1", ""]) {
  test(`rejects invalid order ID ${JSON.stringify(id)}`, async () => {
    const response = await fetched(id);
    assert.equal(response.status, 400);
    const body = (await response.json()) as ApiError;
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(body.error.details?.[0].field, "id");
  });
}

test("order listing and details do not mutate any application rows", async () => {
  const snapshot = () =>
    ["products", "orders", "order_items", "inventory_movements"].map((table) =>
      db.$client.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
    );
  const before = snapshot();
  await listed();
  await listed("?status=SHIPPED&search=read");
  await details(fixtures[0].id);
  assert.deepEqual(snapshot(), before);
});

test("both order read endpoints return safe JSON 500 responses on unexpected database failures", async (context) => {
  const log = context.mock.method(console, "error", () => {});
  db.$client.close();
  for (const response of [await list(request()), await fetched(String(fixtures[0].id))]) {
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
    });
  }
  assert.equal(log.mock.callCount(), 2);
});
