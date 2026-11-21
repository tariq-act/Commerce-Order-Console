import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { orders, orderItems, products } from "../src/db/schema";
import type { Database, Product } from "../src/db/types";
import { dashboardSchema, type DashboardData } from "../src/features/dashboard/types/dashboard";
import type { ApiSuccess } from "../src/lib/api-response";

let db: Database;
let route: typeof import("../src/app/api/dashboard/route").GET;
let directory: string;
let catalog: Product[];
const originalPath = process.env.DATABASE_PATH;
const originalThreshold = process.env.DASHBOARD_LOW_STOCK_THRESHOLD;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-dashboard-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
    env: process.env,
    stdio: "pipe",
  });
  catalog = db.select().from(products).all();
  ({ GET: route } = await import("../src/app/api/dashboard/route"));
});
beforeEach(() => {
  db.$client.exec(
    "DELETE FROM inventory_movements; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products;",
  );
  db.insert(products).values(catalog).run();
  delete process.env.DASHBOARD_LOW_STOCK_THRESHOLD;
});
after(() => {
  db?.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalPath;
  if (originalThreshold === undefined) delete process.env.DASHBOARD_LOW_STOCK_THRESHOLD;
  else process.env.DASHBOARD_LOW_STOCK_THRESHOLD = originalThreshold;
});
async function dashboard(): Promise<DashboardData> {
  const response = await route();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = (await response.json()) as ApiSuccess<DashboardData>;
  assert.equal(body.success, true);
  return dashboardSchema.parse(body.data);
}
function insertOrder(
  index: number,
  status: "PLACED" | "PACKED" | "SHIPPED" | "CANCELLED",
  totalCents = 12345,
) {
  return db
    .insert(orders)
    .values({
      reference: `ORD-DASH-${index}`,
      status,
      totalCents,
      createdAt: new Date("2026-11-21T10:00:00Z"),
    })
    .returning()
    .get();
}

test("empty database returns real zero metrics and empty sections", async () => {
  db.delete(products).run();
  const data = await dashboard();
  assert.deepEqual(data.metrics, {
    totalOrders: 0,
    pendingOrders: 0,
    shippedOrders: 0,
    totalRevenueCents: 0,
  });
  assert.deepEqual(data.recentOrders, []);
  assert.deepEqual(data.lowStockProducts, []);
});
test("default threshold includes zero-stock Webcam HD and excludes other seeded products", async () => {
  const data = await dashboard();
  assert.equal(data.lowStockThreshold, 5);
  assert.deepEqual(
    data.lowStockProducts.map((p) => [p.sku, p.stock]),
    [["ACC-005", 0]],
  );
});
test("low stock uses inclusive configured threshold and lowest quantity first", async () => {
  db.update(products).set({ stock: 5 }).where(eq(products.id, catalog[0].id)).run();
  db.update(products).set({ stock: 6 }).where(eq(products.id, catalog[1].id)).run();
  let data = await dashboard();
  assert.deepEqual(
    data.lowStockProducts.map((p) => p.stock),
    [0, 5],
  );
  process.env.DASHBOARD_LOW_STOCK_THRESHOLD = "6";
  data = await dashboard();
  assert.equal(data.lowStockThreshold, 6);
  assert.deepEqual(
    data.lowStockProducts.map((p) => p.stock),
    [0, 5, 6],
  );
  process.env.DASHBOARD_LOW_STOCK_THRESHOLD = "0";
  assert.deepEqual(
    (await dashboard()).lowStockProducts.map((p) => p.stock),
    [0],
  );
});
test("all status counts and non-cancelled revenue match direct database queries", async () => {
  ["PLACED", "PLACED", "PACKED", "SHIPPED", "CANCELLED"].forEach((status, i) =>
    insertOrder(i, status as (typeof orders.$inferSelect)["status"], (i + 1) * 79900),
  );
  const data = await dashboard();
  const expected = db.$client
    .prepare(
      "SELECT COUNT(*) totalOrders, SUM(status = 'PLACED') pendingOrders, SUM(status = 'SHIPPED') shippedOrders, SUM(CASE WHEN status <> 'CANCELLED' THEN total_cents ELSE 0 END) totalRevenueCents FROM orders",
    )
    .get();
  assert.deepEqual(data.metrics, expected);
  assert.equal(data.metrics.totalRevenueCents, 799000);
});
test("aggregation covers more than a page; exactly five newest orders and total units are returned", async () => {
  const fixtures = Array.from({ length: 125 }, (_, i) =>
    insertOrder(i, i % 2 === 0 ? "PLACED" : "SHIPPED", 79900),
  );
  const last = fixtures.at(-1)!;
  db.insert(orderItems)
    .values([
      { orderId: last.id, productId: catalog[0].id, quantity: 2, unitPriceCents: 79900 },
      { orderId: last.id, productId: catalog[1].id, quantity: 3, unitPriceCents: 249900 },
    ])
    .run();
  const data = await dashboard();
  assert.equal(data.metrics.totalOrders, 125);
  assert.equal(data.metrics.totalRevenueCents, 125 * 79900);
  assert.equal(data.recentOrders.length, 5);
  assert.deepEqual(
    data.recentOrders.map((o) => o.id),
    fixtures
      .slice(-5)
      .reverse()
      .map((o) => o.id),
  );
  assert.equal(data.recentOrders[0].itemCount, 5);
  assert.equal(data.recentOrders[0].createdAt, "2026-11-21T10:00:00.000Z");
  db.update(orders)
    .set({ createdAt: new Date("2026-12-01T00:00:00Z") })
    .where(eq(orders.id, fixtures[0].id))
    .run();
  assert.equal((await dashboard()).recentOrders[0].id, fixtures[0].id);
});
test("revenue and recent totals retain historical prices after product prices change", async () => {
  const { createOrder } = await import("../src/services/order.service");
  const placed = createOrder({ items: [{ productId: catalog[0].id, quantity: 2 }] });
  db.update(products).set({ priceCents: 1 }).where(eq(products.id, catalog[0].id)).run();
  const data = await dashboard();
  assert.equal(data.metrics.totalRevenueCents, 159800);
  assert.equal(data.recentOrders[0].totalCents, placed.totalCents);
});
test("dashboard is read-only even with writes disabled", async () => {
  db.$client.pragma("query_only = ON");
  try {
    await dashboard();
  } finally {
    db.$client.pragma("query_only = OFF");
  }
});
test("cancelled-only orders contribute zero revenue", async () => {
  insertOrder(1, "CANCELLED", 12345);
  assert.deepEqual((await dashboard()).metrics, {
    totalOrders: 1,
    pendingOrders: 0,
    shippedOrders: 0,
    totalRevenueCents: 0,
  });
});
test("unsafe aggregate fails safely instead of showing a rounded revenue", async (t) => {
  insertOrder(1, "PLACED", Number.MAX_SAFE_INTEGER);
  insertOrder(2, "PLACED", 1);
  t.mock.method(console, "error", () => {});
  const response = await route();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
  });
});
test("database failures do not expose internals", async (t) => {
  t.mock.method(db, "transaction", () => {
    throw new Error("private database path");
  });
  t.mock.method(console, "error", () => {});
  const response = await route();
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /private database path/);
});
test("invalid threshold configuration produces a safe error", async (t) => {
  process.env.DASHBOARD_LOW_STOCK_THRESHOLD = "-1";
  t.mock.method(console, "error", () => {});
  assert.equal((await route()).status, 500);
});
