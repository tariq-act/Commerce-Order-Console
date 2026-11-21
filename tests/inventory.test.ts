import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { inventoryMovements, products } from "../src/db/schema";
import type { Database, NewProduct, Product } from "../src/db/types";
import type { ApiError, ApiSuccess } from "../src/lib/api-response";
import type {
  InventoryMovementPage,
  InventoryMovementRecord,
  InventoryRecord,
} from "../src/services/inventory.service";

type JsonMovement = Omit<InventoryMovementRecord, "createdAt"> & { createdAt: string };
type JsonHistory = Omit<InventoryMovementPage, "movements"> & { movements: JsonMovement[] };
let db: Database;
let list: typeof import("../src/app/api/inventory/route").GET;
let detail: typeof import("../src/app/api/inventory/[productId]/route").GET;
let movements: typeof import("../src/app/api/inventory/[productId]/movements/route").GET;
let createOrder: typeof import("../src/services/order.service").createOrder;
let cancelOrder: typeof import("../src/services/order.service").cancelOrder;
let directory: string;
let fixtures: NewProduct[];
let catalog: Product[];
const originalDatabasePath = process.env.DATABASE_PATH;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-inventory-api-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
    env: { ...process.env },
    stdio: "pipe",
  });
  fixtures = db
    .select()
    .from(products)
    .all()
    .map(({ id: _id, ...product }) => product);
  ({ createOrder, cancelOrder } = await import("../src/services/order.service"));
  ({ GET: list } = await import("../src/app/api/inventory/route"));
  ({ GET: detail } = await import("../src/app/api/inventory/[productId]/route"));
  ({ GET: movements } = await import("../src/app/api/inventory/[productId]/movements/route"));
});

beforeEach(() => {
  db.$client.exec(`
    DELETE FROM inventory_movements;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM products;
  `);
  catalog = db.insert(products).values(fixtures).returning().all();
});

after(() => {
  if (db?.$client.open) db.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabasePath;
});

function request(path = "") {
  return new Request(`http://localhost/api/inventory${path}`);
}

function fetched(productId = String(catalog[0].id), query = "") {
  return detail(request(`/${encodeURIComponent(productId)}${query}`), {
    params: Promise.resolve({ productId }),
  });
}

function historyResponse(productId = String(catalog[0].id), query = "") {
  return movements(request(`/${encodeURIComponent(productId)}/movements${query}`), {
    params: Promise.resolve({ productId }),
  });
}

async function success<T>(response: Response): Promise<T> {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = (await response.json()) as ApiSuccess<T>;
  assert.equal(body.success, true);
  return body.data;
}

async function listed(query = "") {
  return success<InventoryRecord[]>(await list(request(query)));
}

async function history(productId = catalog[0].id, query = "") {
  return success<JsonHistory>(await historyResponse(String(productId), query));
}

function snapshot() {
  return ["products", "orders", "order_items", "inventory_movements"].map((table) =>
    db.$client.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
  );
}

test("lists all six inventory records using current stock, paise prices, and availability", async () => {
  const data = await listed();
  assert.equal(data.length, 6);
  assert.deepEqual(
    data.map(({ sku, priceCents, stock, availability }) => ({
      sku,
      priceCents,
      stock,
      availability,
    })),
    [
      { sku: "ACC-001", priceCents: 79900, stock: 25, availability: "in_stock" },
      { sku: "ACC-002", priceCents: 249900, stock: 10, availability: "in_stock" },
      { sku: "ACC-003", priceCents: 149900, stock: 15, availability: "in_stock" },
      { sku: "ACC-004", priceCents: 119900, stock: 8, availability: "in_stock" },
      { sku: "ACC-005", priceCents: 199900, stock: 0, availability: "out_of_stock" },
      { sku: "ACC-006", priceCents: 59900, stock: 30, availability: "in_stock" },
    ],
  );
  assert.ok(data.every((product) => product.name && Number.isSafeInteger(product.priceCents)));
});

test("searches inventory by name case-insensitively with trimmed whitespace", async () => {
  assert.deepEqual(
    (await listed("?search=%20mOuSe%20")).map((p) => p.sku),
    ["ACC-001"],
  );
});

test("searches inventory by complete or partial SKU", async () => {
  assert.deepEqual(
    (await listed("?search=acc-003")).map((p) => p.name),
    ["USB-C Hub"],
  );
  assert.equal((await listed("?search=acc-")).length, 6);
});

test("filters in-stock inventory", async () => {
  const data = await listed("?stock=in_stock");
  assert.equal(data.length, 5);
  assert.ok(data.every((p) => p.stock > 0 && p.availability === "in_stock"));
});

test("filters out-of-stock inventory", async () => {
  const data = await listed("?stock=out_of_stock");
  assert.equal(data.length, 1);
  assert.equal(data[0].sku, "ACC-005");
  assert.equal(data[0].stock, 0);
  assert.equal(data[0].availability, "out_of_stock");
});

test("combines search with stock filtering", async () => {
  assert.deepEqual(
    (await listed("?search=acc-&stock=out_of_stock")).map((p) => p.sku),
    ["ACC-005"],
  );
  assert.deepEqual(
    (await listed("?search=mouse&stock=in_stock")).map((p) => p.sku),
    ["ACC-001"],
  );
  assert.deepEqual(await listed("?search=mouse&stock=out_of_stock"), []);
});

test("returns an empty successful list for no search matches", async () => {
  assert.deepEqual(await listed("?search=no-match"), []);
});

test("treats wildcard and SQL injection search text literally", async () => {
  for (const search of ["%", "_", "' OR 1=1 --", "\\"]) {
    assert.deepEqual(await listed(`?search=${encodeURIComponent(search)}`), []);
  }
  assert.equal((await listed()).length, 6);
});

test("retrieves individual inventory details", async () => {
  assert.deepEqual(await success<InventoryRecord>(await fetched()), {
    id: catalog[0].id,
    name: "Wireless Mouse",
    sku: "ACC-001",
    priceCents: 79900,
    stock: 25,
    availability: "in_stock",
  });
});

test("individual inventory reports zero stock availability", async () => {
  const data = await success<InventoryRecord>(await fetched(String(catalog[4].id)));
  assert.equal(data.stock, 0);
  assert.equal(data.availability, "out_of_stock");
});

test("stock and prices come directly from products even without movement history", async () => {
  db.update(products)
    .set({ stock: 0, priceCents: 12345 })
    .where(eq(products.id, catalog[0].id))
    .run();
  const result = await success<InventoryRecord>(await fetched());
  assert.equal(result.stock, 0);
  assert.equal(result.priceCents, 12345);
  assert.equal(result.availability, "out_of_stock");
  assert.deepEqual((await history()).movements, []);
  assert.equal((await listed("?search=mouse&stock=out_of_stock")).length, 1);
});

test("an existing product without movements returns an empty paginated history", async () => {
  const result = await history();
  assert.equal(result.product.id, catalog[0].id);
  assert.equal(result.product.stock, 25);
  assert.deepEqual(result.movements, []);
  assert.deepEqual(result.pagination, { page: 1, limit: 20, total: 0, totalPages: 0 });
});

test("history exposes the existing ORDER_PLACED movement and order reference", async () => {
  const order = createOrder({ items: [{ productId: catalog[0].id, quantity: 2 }] });
  const result = await history();
  assert.equal(result.product.stock, 23);
  assert.equal(result.movements.length, 1);
  const movement = result.movements[0];
  const stored = db
    .select()
    .from(inventoryMovements)
    .where(eq(inventoryMovements.orderId, order.id))
    .get();
  assert.ok(stored);
  assert.ok(Number.isSafeInteger(movement.id));
  assert.deepEqual(movement, {
    id: stored.id,
    productId: catalog[0].id,
    orderId: order.id,
    orderReference: order.reference,
    type: "ORDER_PLACED",
    quantity: 2,
    createdAt: stored.createdAt.toISOString(),
  });
  assert.deepEqual(result.pagination, { page: 1, limit: 20, total: 1, totalPages: 1 });
});

test("history exposes cancellation and placement exactly once with matching quantities", async () => {
  const order = createOrder({ items: [{ productId: catalog[0].id, quantity: 2 }] });
  cancelOrder(String(order.id));
  const result = await history();
  assert.equal(result.product.stock, 25);
  assert.deepEqual(
    result.movements.map((m) => [m.type, m.quantity, m.orderReference]),
    [
      ["ORDER_CANCELLED", 2, order.reference],
      ["ORDER_PLACED", 2, order.reference],
    ],
  );
  assert.ok(result.movements.every((m) => new Date(m.createdAt).toISOString() === m.createdAt));
  assert.equal(result.pagination.total, 2);
});

test("history contains only movements for the requested product", async () => {
  const order = createOrder({
    items: [
      { productId: catalog[0].id, quantity: 2 },
      { productId: catalog[1].id, quantity: 1 },
    ],
  });
  cancelOrder(String(order.id));
  const mouse = await history();
  const keyboard = await history(catalog[1].id);
  assert.equal(mouse.movements.length, 2);
  assert.equal(keyboard.movements.length, 2);
  assert.ok(mouse.movements.every((m) => m.productId === catalog[0].id && m.quantity === 2));
  assert.ok(keyboard.movements.every((m) => m.productId === catalog[1].id && m.quantity === 1));
});

test("sorts history by newest timestamp and then descending movement ID", async () => {
  const first = createOrder({ items: [{ productId: catalog[0].id, quantity: 1 }] });
  cancelOrder(String(first.id));
  const second = createOrder({ items: [{ productId: catalog[0].id, quantity: 1 }] });
  cancelOrder(String(second.id));
  const rows = db.select().from(inventoryMovements).orderBy(inventoryMovements.id).all();
  for (const [index, day] of [1, 4, 3, 4].entries()) {
    db.update(inventoryMovements)
      .set({ createdAt: new Date(Date.UTC(2026, 10, day)) })
      .where(eq(inventoryMovements.id, rows[index].id))
      .run();
  }
  assert.deepEqual(
    (await history()).movements.map((m) => m.id),
    [rows[3].id, rows[1].id, rows[2].id, rows[0].id],
  );
});

test("paginates history without duplicates or missing movements", async () => {
  for (let index = 0; index < 5; index++)
    createOrder({ items: [{ productId: catalog[0].id, quantity: 1 }] });
  const first = await history(catalog[0].id, "?page=1&limit=2");
  const second = await history(catalog[0].id, "?page=2&limit=2");
  const third = await history(catalog[0].id, "?page=3&limit=2");
  assert.deepEqual(first.pagination, { page: 1, limit: 2, total: 5, totalPages: 3 });
  assert.deepEqual(
    [...first.movements, ...second.movements, ...third.movements],
    (await history()).movements,
  );
  assert.equal(
    new Set([...first.movements, ...second.movements, ...third.movements].map((m) => m.id)).size,
    5,
  );
  assert.equal(third.movements.length, 1);
  assert.equal((await history(catalog[0].id, "?limit=100")).movements.length, 5);
});

test("defaults movement history to twenty entries per page", async () => {
  for (let index = 0; index < 21; index++)
    createOrder({ items: [{ productId: catalog[0].id, quantity: 1 }] });
  const first = await history();
  assert.equal(first.movements.length, 20);
  assert.deepEqual(first.pagination, { page: 1, limit: 20, total: 21, totalPages: 2 });
  assert.equal((await history(catalog[0].id, "?page=2")).movements.length, 1);
});

test("pages beyond the last movement return empty results with matching totals", async () => {
  createOrder({ items: [{ productId: catalog[0].id, quantity: 1 }] });
  const result = await history(catalog[0].id, "?page=10&limit=1");
  assert.deepEqual(result.movements, []);
  assert.deepEqual(result.pagination, { page: 10, limit: 1, total: 1, totalPages: 1 });
});

test("repeated views and repeated cancellation never duplicate historical movements", async () => {
  const order = createOrder({ items: [{ productId: catalog[0].id, quantity: 2 }] });
  cancelOrder(String(order.id));
  assert.throws(() => cancelOrder(String(order.id)));
  const before = snapshot();
  const original = await history();
  for (let index = 0; index < 5; index++) {
    assert.deepEqual(await history(), original);
    await listed();
    await fetched();
  }
  assert.equal(new Set(original.movements.map((m) => m.id)).size, 2);
  assert.deepEqual(snapshot(), before);
});

test("all GET endpoints succeed with database writes disabled and leave every row unchanged", async () => {
  const order = createOrder({ items: [{ productId: catalog[0].id, quantity: 2 }] });
  cancelOrder(String(order.id));
  const before = snapshot();
  db.$client.pragma("query_only = ON");
  try {
    await listed();
    await listed("?search=acc-&stock=in_stock");
    await success<InventoryRecord>(await fetched());
    await history();
    await history(catalog[0].id, "?page=2&limit=1");
    assert.deepEqual(snapshot(), before);
  } finally {
    db.$client.pragma("query_only = OFF");
  }
});

test("nonexistent products return 404 for details and movement history", async () => {
  for (const response of [await fetched("999999"), await historyResponse("999999")]) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: "NOT_FOUND", message: "Product not found." },
    });
  }
});

for (const productId of ["abc", "0", "-1", "1.5", "1e2", "9007199254740992", "1 OR 1=1", ""]) {
  test(`rejects invalid inventory product ID ${JSON.stringify(productId)}`, async () => {
    for (const response of [await fetched(productId), await historyResponse(productId)]) {
      assert.equal(response.status, 400);
      const body = (await response.json()) as ApiError;
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assert.equal(body.error.details?.[0].field, "productId");
    }
  });
}

for (const query of [
  "?stock=available",
  "?stock=",
  "?search=",
  "?search=%20",
  `?search=${"a".repeat(201)}`,
  "?stock=in_stock&stock=out_of_stock",
  "?search=mouse&search=hub",
  "?unknown=value",
  "?__proto__=value",
]) {
  test(`rejects invalid inventory list query ${query.slice(0, 65)}`, async () => {
    const response = await list(request(query));
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as ApiError).error.code, "VALIDATION_ERROR");
  });
}

for (const query of [
  "?page=0",
  "?page=-1",
  "?page=1.5",
  "?page=1e2",
  "?page=abc",
  "?page=",
  "?page=9007199254740992",
  "?page=9007199254740991&limit=100",
  "?page=1&page=2",
  "?limit=0",
  "?limit=-1",
  "?limit=101",
  "?limit=1.5",
  "?limit=1e2",
  "?limit=abc",
  "?limit=",
  "?limit=20&limit=10",
  "?unknown=value",
  "?stock=in_stock",
]) {
  test(`rejects invalid movement pagination query ${query}`, async () => {
    const response = await historyResponse(String(catalog[0].id), query);
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as ApiError).error.code, "VALIDATION_ERROR");
  });
}

test("rejects unsupported query parameters on individual inventory details", async () => {
  const response = await fetched(String(catalog[0].id), "?stock=in_stock");
  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as ApiError).error.code, "VALIDATION_ERROR");
});

test("all inventory endpoints return safe JSON 500 responses for unexpected failures", async (context) => {
  const log = context.mock.method(console, "error", () => {});
  db.$client.close();
  for (const response of [await list(request()), await fetched(), await historyResponse()]) {
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
    });
  }
  assert.equal(log.mock.callCount(), 3);
});
