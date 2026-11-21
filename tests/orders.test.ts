import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { inventoryMovements, orderItems, orders, products } from "../src/db/schema";
import type { Database, NewProduct, Product } from "../src/db/types";
import type { ApiError, ApiSuccess } from "../src/lib/api-response";
import type { CreatedOrder } from "../src/services/order.service";

type JsonOrder = Omit<CreatedOrder, "createdAt"> & { createdAt: string };
let db: Database;
let post: typeof import("../src/app/api/orders/route").POST;
let connect: typeof import("../src/db/connection").createDatabase;
let directory: string;
let fixtures: NewProduct[];
let catalog: Product[];
const originalDatabasePath = process.env.DATABASE_PATH;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-order-api-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  ({ createDatabase: connect } = await import("../src/db/connection"));
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
  ({ POST: post } = await import("../src/app/api/orders/route"));
});

beforeEach(() => {
  db.$client.exec(`
    DROP TRIGGER IF EXISTS inject_failure;
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

function product(sku = "ACC-001") {
  const value = catalog.find((item) => item.sku === sku);
  assert.ok(value);
  return value;
}

function state() {
  return {
    products: db.select().from(products).all(),
    orders: db.select().from(orders).all(),
    items: db.select().from(orderItems).all(),
    movements: db.select().from(inventoryMovements).all(),
  };
}

function place(body: unknown) {
  return post(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function created(items: { productId: number | string; quantity: number }[]) {
  const response = await place({ items });
  assert.equal(response.status, 201);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = (await response.json()) as ApiSuccess<JsonOrder>;
  assert.equal(body.success, true);
  return body.data;
}

async function rejected(body: unknown, status: number, code: ApiError["error"]["code"]) {
  const before = state();
  const response = await place(body);
  assert.equal(response.status, status);
  const json = (await response.json()) as ApiError;
  assert.equal(json.success, false);
  assert.equal(json.error.code, code);
  assert.deepEqual(state(), before, "failed placement must leave all rows and stock unchanged");
}

test("creates a single-product PLACED order with its reference and timestamp", async () => {
  const mouse = product();
  const order = await created([{ productId: String(mouse.id), quantity: 2 }]);
  assert.ok(Number.isSafeInteger(order.id));
  assert.match(order.reference, /^ORD-[0-9a-f-]{36}$/);
  assert.equal(order.status, "PLACED");
  assert.equal(order.totalCents, 159800);
  assert.equal(new Date(order.createdAt).toISOString(), order.createdAt);
  assert.deepEqual(order.items, [
    {
      productId: mouse.id,
      productName: mouse.name,
      quantity: 2,
      unitPriceCents: 79900,
    },
  ]);
  assert.equal(state().orders.length, 1);
  assert.equal(state().items[0].orderId, order.id);
});

test("creates a multi-product order and calculates the exact paise total", async () => {
  const mouse = product();
  const keyboard = product("ACC-002");
  const order = await created([
    { productId: mouse.id, quantity: 2 },
    { productId: keyboard.id, quantity: 1 },
  ]);
  assert.equal(order.totalCents, 409700);
  assert.equal(state().orders[0].totalCents, 409700);
  assert.equal(order.items.length, 2);
  assert.equal(state().items.length, 2);
});

test("deducts every requested quantity and writes matching ORDER_PLACED movements", async () => {
  const mouse = product();
  const hub = product("ACC-003");
  const order = await created([
    { productId: mouse.id, quantity: 3 },
    { productId: hub.id, quantity: 2 },
  ]);
  const current = state();
  assert.equal(current.products.find((p) => p.id === mouse.id)?.stock, 22);
  assert.equal(current.products.find((p) => p.id === hub.id)?.stock, 13);
  assert.deepEqual(
    current.movements.map(({ productId, orderId, type, quantity }) => ({
      productId,
      orderId,
      type,
      quantity,
    })),
    [
      { productId: mouse.id, orderId: order.id, type: "ORDER_PLACED", quantity: 3 },
      { productId: hub.id, orderId: order.id, type: "ORDER_PLACED", quantity: 2 },
    ],
  );
});

test("allows ordering the exact remaining stock and zero-priced products", async () => {
  const stand = product("ACC-004");
  db.update(products).set({ priceCents: 0 }).where(eq(products.id, stand.id)).run();
  const order = await created([{ productId: stand.id, quantity: 8 }]);
  assert.equal(order.totalCents, 0);
  assert.equal(state().products.find((p) => p.id === stand.id)?.stock, 0);
});

test("rejects nonexistent products with 404 without creating any related rows", async () => {
  await rejected({ items: [{ productId: 999999, quantity: 1 }] }, 404, "NOT_FOUND");
});

test("rejects insufficient stock with 409", async () => {
  await rejected({ items: [{ productId: product().id, quantity: 26 }] }, 409, "INSUFFICIENT_STOCK");
});

test("rejects an out-of-stock product with 409", async () => {
  await rejected(
    { items: [{ productId: product("ACC-005").id, quantity: 1 }] },
    409,
    "INSUFFICIENT_STOCK",
  );
});

test("rejects the entire multi-product order when a later product is unavailable", async () => {
  await rejected(
    {
      items: [
        { productId: product().id, quantity: 2 },
        { productId: product("ACC-005").id, quantity: 1 },
      ],
    },
    409,
    "INSUFFICIENT_STOCK",
  );
});

test("rejects the entire multi-product order when a later product does not exist", async () => {
  await rejected(
    {
      items: [
        { productId: product().id, quantity: 2 },
        { productId: 999999, quantity: 1 },
      ],
    },
    404,
    "NOT_FOUND",
  );
});

for (const quantity of [0, -1, 1.5, "2", null, Number.MAX_SAFE_INTEGER + 1]) {
  test(`rejects invalid quantity ${JSON.stringify(quantity)}`, async () => {
    await rejected({ items: [{ productId: product().id, quantity }] }, 400, "VALIDATION_ERROR");
  });
}

for (const productId of [
  0,
  -1,
  1.5,
  "product-id-1",
  "1e2",
  "",
  null,
  Number.MAX_SAFE_INTEGER + 1,
]) {
  test(`rejects invalid product ID ${JSON.stringify(productId)}`, async () => {
    await rejected({ items: [{ productId, quantity: 1 }] }, 400, "VALIDATION_ERROR");
  });
}

for (const body of [
  {},
  { items: [] },
  { items: null },
  null,
  [],
  { items: [{}] },
  { items: [], extra: true },
]) {
  test(`rejects invalid request shape ${JSON.stringify(body)}`, async () => {
    await rejected(body, 400, "VALIDATION_ERROR");
  });
}

test("rejects duplicate product IDs after normalizing numeric strings", async () => {
  const id = product().id;
  await rejected(
    {
      items: [
        { productId: id, quantity: 1 },
        { productId: `0${id}`, quantity: 1 },
      ],
    },
    400,
    "VALIDATION_ERROR",
  );
});

test("rejects client-supplied unit prices", async () => {
  await rejected(
    { items: [{ productId: product().id, quantity: 1, unitPriceCents: 1 }] },
    400,
    "VALIDATION_ERROR",
  );
});

test("rejects malformed and empty JSON with 400", async () => {
  const before = state();
  for (const body of ["{", ""]) {
    const response = await post(
      new Request("http://localhost/api/orders", { method: "POST", body }),
    );
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as ApiError).error.code, "VALIDATION_ERROR");
  }
  assert.deepEqual(state(), before);
});

test("rejects multiplication overflow before any stock or order writes", async () => {
  const mouse = product();
  db.update(products)
    .set({ priceCents: Number.MAX_SAFE_INTEGER })
    .where(eq(products.id, mouse.id))
    .run();
  await rejected({ items: [{ productId: mouse.id, quantity: 2 }] }, 400, "VALIDATION_ERROR");
});

test("rejects addition overflow across otherwise safe line totals", async () => {
  const mouse = product();
  const hub = product("ACC-003");
  db.update(products)
    .set({ priceCents: Number.MAX_SAFE_INTEGER })
    .where(eq(products.id, mouse.id))
    .run();
  await rejected(
    {
      items: [
        { productId: mouse.id, quantity: 1 },
        { productId: hub.id, quantity: 1 },
      ],
    },
    400,
    "VALIDATION_ERROR",
  );
});

test("preserves historical unit prices after the product price changes", async () => {
  const mouse = product();
  const first = await created([{ productId: mouse.id, quantity: 2 }]);
  db.update(products).set({ priceCents: 99900 }).where(eq(products.id, mouse.id)).run();
  const second = await created([{ productId: mouse.id, quantity: 1 }]);
  assert.notEqual(first.reference, second.reference);
  assert.equal(state().items.find((item) => item.orderId === first.id)?.unitPriceCents, 79900);
  assert.equal(state().orders.find((order) => order.id === first.id)?.totalCents, 159800);
  assert.equal(state().items.find((item) => item.orderId === second.id)?.unitPriceCents, 99900);
});

for (const [table, event] of [
  ["orders", "INSERT"],
  ["order_items", "INSERT"],
  ["products", "UPDATE"],
  ["inventory_movements", "INSERT"],
]) {
  test(`rolls back all changes if ${table} ${event} fails`, async (context) => {
    context.mock.method(console, "error", () => {});
    db.$client.exec(`CREATE TRIGGER inject_failure BEFORE ${event} ON ${table}
      BEGIN SELECT RAISE(ABORT, 'private database failure'); END`);
    const before = state();
    const response = await place({ items: [{ productId: product().id, quantity: 1 }] });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
    });
    assert.deepEqual(state(), before);
  });
}

test("rolls back earlier stock, items, movements, and order on a late second-item failure", async (context) => {
  context.mock.method(console, "error", () => {});
  const hub = product("ACC-003");
  db.$client.exec(`CREATE TRIGGER inject_failure BEFORE INSERT ON inventory_movements
    WHEN NEW.product_id = ${hub.id} BEGIN SELECT RAISE(ABORT, 'late movement failure'); END`);
  await rejected(
    {
      items: [
        { productId: product().id, quantity: 2 },
        { productId: hub.id, quantity: 1 },
      ],
    },
    500,
    "INTERNAL_SERVER_ERROR",
  );
});

test("rolls back everything if an atomic conditional stock update affects no row", async () => {
  const hub = product("ACC-003");
  db.$client.exec(`CREATE TRIGGER inject_failure BEFORE UPDATE ON products
    WHEN OLD.id = ${hub.id} BEGIN SELECT RAISE(IGNORE); END`);
  await rejected(
    {
      items: [
        { productId: product().id, quantity: 2 },
        { productId: hub.id, quantity: 1 },
      ],
    },
    409,
    "INVENTORY_CONFLICT",
  );
});

test("maps write-lock timeout to a safe inventory conflict without modifying data", async () => {
  const blocker = connect(process.env.DATABASE_PATH!);
  blocker.$client.exec("BEGIN IMMEDIATE");
  db.$client.pragma("busy_timeout = 10");
  try {
    await rejected(
      { items: [{ productId: product().id, quantity: 1 }] },
      409,
      "INVENTORY_CONFLICT",
    );
  } finally {
    blocker.$client.exec("ROLLBACK");
    blocker.$client.close();
    db.$client.pragma("busy_timeout = 5000");
  }
});

function placementWorker() {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/helpers/place-order-worker.ts"],
    {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let output = "";
  let errors = "";
  let readyResolve: () => void;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
    if (output.includes("READY\n")) readyResolve();
  });
  child.stderr.on("data", (chunk) => {
    errors += String(chunk);
  });
  const result = new Promise<{ status: number; body: ApiSuccess<JsonOrder> | ApiError }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        readyResolve();
        if (code !== 0) return reject(new Error(`Placement worker exited ${code}: ${errors}`));
        try {
          resolve(JSON.parse(output.trim().split("\n").at(-1)!));
        } catch (error) {
          reject(error);
        }
      });
    },
  );
  // The readiness barrier is awaited before the results are consumed.
  void result.catch(() => {});
  return { child, ready, result };
}

test(
  "four independent concurrent writers cannot oversell limited stock",
  { timeout: 20000 },
  async () => {
    const mouse = product();
    db.update(products).set({ stock: 3 }).where(eq(products.id, mouse.id)).run();
    const workers = Array.from({ length: 4 }, placementWorker);
    try {
      await Promise.all(workers.map((worker) => worker.ready));
      // Hold a real writer lock until all workers have been sent their requests.
      db.$client.exec("BEGIN IMMEDIATE");
      try {
        for (const worker of workers) {
          worker.child.stdin.end(
            JSON.stringify({ items: [{ productId: mouse.id, quantity: 2 }] }) + "\n",
          );
        }
        await delay(150);
      } finally {
        db.$client.exec("ROLLBACK");
      }
      const results = await Promise.all(workers.map((worker) => worker.result));
      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409, 409, 409]);
      for (const result of results.filter((result) => result.status === 409)) {
        assert.equal((result.body as ApiError).error.code, "INSUFFICIENT_STOCK");
      }
      const current = state();
      assert.equal(current.products.find((p) => p.id === mouse.id)?.stock, 1);
      assert.ok(current.products.every((p) => p.stock >= 0));
      assert.equal(current.orders.length, 1);
      assert.equal(current.items.length, 1);
      assert.equal(current.items[0].quantity, 2);
      assert.equal(current.movements.length, 1);
      assert.equal(current.movements[0].quantity, 2);
      assert.deepEqual(db.$client.pragma("foreign_key_check"), []);
    } finally {
      for (const worker of workers) if (worker.child.exitCode === null) worker.child.kill();
    }
  },
);
