import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Database, Product } from "../src/db/types";
import type { ApiError, ApiSuccess } from "../src/lib/api-response";

type JsonProduct = Omit<Product, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

let db: Database;
let list: typeof import("../src/app/api/products/route").GET;
let detail: typeof import("../src/app/api/products/[id]/route").GET;
let directory: string;
const originalDatabasePath = process.env.DATABASE_PATH;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-product-api-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  // Set the path before importing the shared connection; never touch application data.
  ({ db } = await import("../src/db"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
    env: { ...process.env }, stdio: "pipe",
  });
  ({ GET: list } = await import("../src/app/api/products/route"));
  ({ GET: detail } = await import("../src/app/api/products/[id]/route"));
});

after(() => {
  if (db?.$client.open) db.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabasePath;
});

function request(query = "") {
  return new Request(`http://localhost/api/products${query}`);
}

async function listed(query = "") {
  const response = await list(request(query));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as ApiSuccess<JsonProduct[]>;
  assert.equal(body.success, true);
  return body.data;
}

async function fetched(id: string) {
  return detail(new Request(`http://localhost/api/products/${id}`), {
    params: Promise.resolve({ id }),
  });
}

test("lists all six seeded products with integer paise and serialized timestamps", async () => {
  const data = await listed();
  assert.deepEqual(data.map(({ sku, priceCents, stock }) => ({ sku, priceCents, stock })), [
    { sku: "ACC-001", priceCents: 79900, stock: 25 },
    { sku: "ACC-002", priceCents: 249900, stock: 10 },
    { sku: "ACC-003", priceCents: 149900, stock: 15 },
    { sku: "ACC-004", priceCents: 119900, stock: 8 },
    { sku: "ACC-005", priceCents: 199900, stock: 0 },
    { sku: "ACC-006", priceCents: 59900, stock: 30 },
  ]);
  for (const product of data) {
    assert.ok(product.description.length > 0);
    assert.ok(Number.isSafeInteger(product.priceCents));
    assert.equal(new Date(product.createdAt).toISOString(), product.createdAt);
    assert.equal(new Date(product.updatedAt).toISOString(), product.updatedAt);
  }
});

test("searches product names case-insensitively and trims whitespace", async () => {
  assert.deepEqual((await listed("?search=%20mOuSe%20")).map((p) => p.sku), ["ACC-001"]);
});

test("searches full and partial SKUs case-insensitively", async () => {
  assert.deepEqual((await listed("?search=acc-003")).map((p) => p.name), ["USB-C Hub"]);
  assert.equal((await listed("?search=acc-")).length, 6);
});

test("filters five in-stock products", async () => {
  const data = await listed("?stock=in_stock");
  assert.equal(data.length, 5);
  assert.ok(data.every((p) => p.stock > 0));
  assert.ok(data.every((p) => p.sku !== "ACC-005"));
});

test("filters the out-of-stock webcam", async () => {
  const data = await listed("?stock=out_of_stock");
  assert.equal(data.length, 1);
  assert.equal(data[0].sku, "ACC-005");
  assert.equal(data[0].stock, 0);
});

test("combines name and SKU search with both stock filters using AND", async () => {
  assert.deepEqual((await listed("?search=keyboard&stock=in_stock")).map((p) => p.sku), ["ACC-002"]);
  assert.deepEqual((await listed("?search=acc-&stock=out_of_stock")).map((p) => p.sku), ["ACC-005"]);
  assert.deepEqual(await listed("?search=webcam&stock=in_stock"), []);
  assert.deepEqual(await listed("?search=mouse&stock=out_of_stock"), []);
});

test("returns an empty successful list when no products match", async () => {
  assert.deepEqual(await listed("?search=does-not-exist"), []);
});

test("treats SQL metacharacters and injection strings as literal search text", async () => {
  for (const search of ["%", "_", "' OR 1=1 --", "\\"]) {
    assert.deepEqual(await listed(`?search=${encodeURIComponent(search)}`), []);
  }
  assert.equal((await listed()).length, 6);
});

test("fetches a valid product ID and matches the list representation", async () => {
  const [product] = await listed();
  const response = await fetched(String(product.id));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as ApiSuccess<JsonProduct>;
  assert.deepEqual(body, { success: true, data: product });
});

test("returns a consistent 404 response for a nonexistent product", async () => {
  const response = await fetched("999999");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false, error: { code: "NOT_FOUND", message: "Product not found." },
  });
});

for (const id of ["abc", "0", "-1", "1.5", "1e2", "Infinity", "9007199254740992", "1 OR 1=1", ""]) {
  test(`rejects invalid product ID ${JSON.stringify(id)} with 400`, async () => {
    const response = await fetched(id);
    assert.equal(response.status, 400);
    const body = await response.json() as ApiError;
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(body.error.details?.[0].field, "id");
  });
}

for (const query of [
  "?stock=available", "?stock=", "?stock=IN_STOCK", "?search=", "?search=%20%20",
  `?search=${"a".repeat(201)}`, "?unknown=value", "?__proto__=value",
  "?search=mouse&search=hub", "?stock=in_stock&stock=out_of_stock",
]) {
  test(`rejects invalid query ${query.slice(0, 65)} with 400`, async () => {
    const response = await list(request(query));
    assert.equal(response.status, 400);
    const body = await response.json() as ApiError;
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.details?.length);
  });
}

test("reads current stock from SQLite on each request", async () => {
  db.$client.prepare("UPDATE products SET stock = 0 WHERE sku = 'ACC-001'").run();
  try {
    assert.deepEqual((await listed("?search=mouse&stock=out_of_stock")).map((p) => p.sku), ["ACC-001"]);
    assert.deepEqual(await listed("?search=mouse&stock=in_stock"), []);
  } finally {
    db.$client.prepare("UPDATE products SET stock = 25 WHERE sku = 'ACC-001'").run();
  }
});

test("product reads do not create orders, order items, or inventory movements", () => {
  for (const table of ["orders", "order_items", "inventory_movements"]) {
    assert.equal((db.$client.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count, 0);
  }
});

test("both endpoints return safe JSON 500 responses on database failures", async (context) => {
  const log = context.mock.method(console, "error", () => {});
  db.$client.close();
  for (const response of [await list(request()), await fetched("1")]) {
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
    });
  }
  assert.equal(log.mock.callCount(), 2);
});
