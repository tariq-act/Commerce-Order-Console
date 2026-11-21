import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Database } from "../src/db/types";
import { apiGet, ApiClientError } from "../src/lib/api-client";
import {
  parseCatalogueFilters,
  parseSelectedProduct,
  productsApiPath,
  updateCatalogueUrl,
} from "../src/features/products/catalogue-params";
import { productSchema, productsSchema } from "../src/features/products/types/product";
import { ProductTable } from "../src/features/products/components/product-table";
import { ProductInformation } from "../src/features/products/components/product-details";

let db: Database;
let directory: string;
let list: typeof import("../src/app/api/products/route").GET;
let detail: typeof import("../src/app/api/products/[id]/route").GET;
const originalPath = process.env.DATABASE_PATH;
before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-product-catalogue-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
    env: process.env,
    stdio: "pipe",
  });
  ({ GET: list } = await import("../src/app/api/products/route"));
  ({ GET: detail } = await import("../src/app/api/products/[id]/route"));
});
after(() => {
  db?.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalPath;
});

function parameters(query = "") {
  return new URLSearchParams(query);
}
async function listed(query = "") {
  const response = await list(new Request(`http://localhost/api/products${query}`));
  assert.equal(response.status, 200);
  return productsSchema.parse((await response.json()).data);
}
test("catalogue URL filters trim search and match backend parameter names", () => {
  assert.deepEqual(
    parseCatalogueFilters(parameters("search=%20mouse%20&stock=in_stock&product=1")).data,
    { search: "mouse", stock: "in_stock" },
  );
  assert.deepEqual(parseCatalogueFilters(parameters("search=%20%20")).data, {});
  assert.deepEqual(parseCatalogueFilters(parameters()).data, {});
});
test("malformed and duplicate filters are rejected instead of silently showing all products", () => {
  for (const query of [
    "stock=invalid",
    "stock=in_stock&stock=out_of_stock",
    "search=one&search=two",
    `search=${"a".repeat(201)}`,
  ]) {
    assert.equal(parseCatalogueFilters(parameters(query)).success, false, query);
  }
});
test("deep links accept positive IDs and reject malformed or ambiguous selections", () => {
  assert.deepEqual(parseSelectedProduct(parameters()), { selected: false, id: null });
  assert.deepEqual(parseSelectedProduct(parameters("product=001")), { selected: true, id: 1 });
  for (const query of [
    "product=0",
    "product=-1",
    "product=wrong",
    "product=",
    "product=1&product=2",
    "product=9007199254740992",
  ]) {
    assert.deepEqual(parseSelectedProduct(parameters(query)), { selected: true, id: null });
  }
});
test("list requests encode search safely and omit frontend-only selection parameters", () => {
  const path = productsApiPath({ search: "USB-C & accessories?", stock: "out_of_stock" });
  const url = new URL(path, "http://localhost");
  assert.equal(url.pathname, "/api/products");
  assert.equal(url.searchParams.get("search"), "USB-C & accessories?");
  assert.equal(url.searchParams.get("stock"), "out_of_stock");
  assert.equal(url.searchParams.has("product"), false);
  assert.equal(productsApiPath({}), "/api/products");
});
test("a delayed search preserves a stock selection made before the URL update", (t) => {
  const location = { href: "http://localhost/products?stock=in_stock&product=2#catalogue" };
  const calls: string[] = [];
  const history = {
    replaceState: (_state: unknown, _unused: string, url: string) => {
      calls.push("replace");
      location.href = new URL(url, location.href).href;
    },
    pushState: (_state: unknown, _unused: string, url: string) => {
      calls.push("push");
      location.href = new URL(url, location.href).href;
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location, history } });
  t.after(() => {
    Reflect.deleteProperty(globalThis, "window");
  });
  updateCatalogueUrl({ search: "mouse" });
  assert.equal(new URL(location.href).searchParams.get("stock"), "in_stock");
  assert.equal(new URL(location.href).searchParams.get("product"), "2");
  updateCatalogueUrl({ stock: "out_of_stock" }, "push");
  updateCatalogueUrl({ product: null });
  assert.equal(
    location.href,
    "http://localhost/products?stock=out_of_stock&search=mouse#catalogue",
  );
  assert.deepEqual(calls, ["replace", "push", "replace"]);
});
test("actual seeded API data renders all six product names, prices, availability, and detail controls", async () => {
  const rows = await listed();
  assert.equal(rows.length, 6);
  const markup = renderToStaticMarkup(
    createElement(ProductTable, { products: rows, onView: () => {} }),
  );
  for (const row of rows) {
    assert.ok(markup.includes(row.name));
    assert.ok(markup.includes(row.sku));
    assert.ok(markup.includes(`aria-label="View details for ${row.name}"`));
  }
  assert.match(markup, /₹799\.00/);
  assert.match(markup, /₹2,499\.00/);
  assert.equal((markup.match(/>In stock</g) ?? []).length, 5);
  assert.equal((markup.match(/>Out of stock</g) ?? []).length, 1);
});
test("catalogue client accepts actual API responses for name, SKU, stock and combined searches", async (t) => {
  t.mock.method(globalThis, "fetch", async (path: string) =>
    list(new Request(`http://localhost${path}`)),
  );
  for (const [filters, skus] of [
    [{ search: "Mouse" }, ["ACC-001"]],
    [{ search: "ACC-003" }, ["ACC-003"]],
    [{ stock: "out_of_stock" }, ["ACC-005"]],
    [{ search: "Webcam", stock: "in_stock" }, []],
  ] as const) {
    const data = await apiGet(productsApiPath(filters), productsSchema);
    assert.deepEqual(
      data.map((row) => row.sku),
      [...skus],
    );
  }
  assert.equal((await apiGet(productsApiPath({ stock: "in_stock" }), productsSchema)).length, 5);
});
test("details consume the detail endpoint and show live inventory, description and price", async (t) => {
  const webcam = (await listed()).find((row) => row.sku === "ACC-005")!;
  t.mock.method(globalThis, "fetch", async () =>
    detail(new Request(`http://localhost/api/products/${webcam.id}`), {
      params: Promise.resolve({ id: String(webcam.id) }),
    }),
  );
  const data = await apiGet(`/api/products/${webcam.id}`, productSchema);
  const markup = renderToStaticMarkup(createElement(ProductInformation, { product: data }));
  assert.match(markup, /Webcam HD/);
  assert.match(markup, /ACC-005/);
  assert.match(markup, /₹1,999\.00/);
  assert.match(markup, /Out of stock/);
  assert.match(markup, /Available inventory/);
  assert.equal(data.stock, 0);
  assert.ok(data.description.length > 0);
});
test("missing details and API failures reach the client error path instead of fabricated data", async (t) => {
  const stub = t.mock.method(globalThis, "fetch", async () =>
    detail(new Request("http://localhost/api/products/999999"), {
      params: Promise.resolve({ id: "999999" }),
    }),
  );
  await assert.rejects(
    apiGet("/api/products/999999", productSchema),
    (error) => error instanceof ApiClientError && error.status === 404,
  );
  stub.mock.mockImplementation(async () => new Response("private database error", { status: 500 }));
  await assert.rejects(
    apiGet("/api/products", productsSchema),
    (error) =>
      error instanceof ApiClientError && error.status === 500 && !error.message.includes("private"),
  );
});
