import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { inventoryMovements, orderItems, orders, orderStatuses, products } from "../src/db/schema";
import type { Database, NewProduct, Order, Product } from "../src/db/types";
import type { ApiError, ApiSuccess } from "../src/lib/api-response";
import type { CreatedOrder } from "../src/services/order.service";

type JsonOrder = Omit<Order, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
let db: Database;
let patch: typeof import("../src/app/api/orders/[id]/status/route").PATCH;
let cancel: typeof import("../src/app/api/orders/[id]/cancel/route").POST;
let createOrder: typeof import("../src/services/order.service").createOrder;
let connect: typeof import("../src/db/connection").createDatabase;
let directory: string;
let fixtures: NewProduct[];
let catalog: Product[];
let order: CreatedOrder;
const originalDatabasePath = process.env.DATABASE_PATH;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-order-transitions-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  ({ createDatabase: connect } = await import("../src/db/connection"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], { env: { ...process.env }, stdio: "pipe" });
  fixtures = db.select().from(products).all().map(({ id: _id, ...product }) => product);
  ({ createOrder } = await import("../src/services/order.service"));
  ({ PATCH: patch } = await import("../src/app/api/orders/[id]/status/route"));
  ({ POST: cancel } = await import("../src/app/api/orders/[id]/cancel/route"));
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
  order = createOrder({ items: [
    { productId: catalog[0].id, quantity: 2 }, { productId: catalog[1].id, quantity: 1 },
  ] });
});

after(() => {
  if (db?.$client.open) db.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabasePath;
});

function state() {
  return {
    products: db.select().from(products).all(),
    orders: db.select().from(orders).all(),
    items: db.select().from(orderItems).all(),
    movements: db.select().from(inventoryMovements).all(),
  };
}

function patchStatus(body: unknown, id = String(order.id)) {
  return patch(new Request(`http://localhost/api/orders/${id}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

function cancelOrder(id = String(order.id)) {
  return cancel(new Request(`http://localhost/api/orders/${id}/cancel`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

async function successful(response: Response, status: Order["status"]) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as ApiSuccess<JsonOrder>;
  assert.equal(body.success, true);
  assert.equal(body.data.id, order.id);
  assert.equal(body.data.reference, order.reference);
  assert.equal(body.data.totalCents, order.totalCents);
  assert.equal(body.data.status, status);
  assert.equal(body.data.createdAt, order.createdAt.toISOString());
  assert.equal(new Date(body.data.updatedAt).toISOString(), body.data.updatedAt);
  return body.data;
}

async function rejected(action: () => Promise<Response>, status: number, code: ApiError["error"]["code"]) {
  const before = state();
  const response = await action();
  assert.equal(response.status, status);
  const body = await response.json() as ApiError;
  assert.equal(body.success, false);
  assert.equal(body.error.code, code);
  if (status === 500) assert.deepEqual(body, {
    success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
  });
  assert.deepEqual(state(), before, "failed transition must roll back every row and stock value");
}

function assertHistory(before: ReturnType<typeof state>, current = state()) {
  assert.deepEqual(current.items, before.items);
  assert.deepEqual(current.movements.filter((movement) => movement.type === "ORDER_PLACED"),
    before.movements.filter((movement) => movement.type === "ORDER_PLACED"));
  const historicalFields = (rows: Order[]) => rows.map(({ status: _status, updatedAt: _updatedAt, ...history }) => history);
  assert.deepEqual(historicalFields(current.orders), historicalFields(before.orders));
}

test("PLACED to PACKED succeeds without changing inventory or order history", async () => {
  const before = state();
  await successful(await patchStatus({ status: "PACKED" }), "PACKED");
  assert.deepEqual(state().products, before.products);
  assert.deepEqual(state().movements, before.movements);
  assertHistory(before);
});

test("PACKED to SHIPPED succeeds without changing inventory or history", async () => {
  await successful(await patchStatus({ status: "PACKED" }), "PACKED");
  const before = state();
  await successful(await patchStatus({ status: "SHIPPED" }), "SHIPPED");
  assert.deepEqual(state().products, before.products);
  assert.deepEqual(state().movements, before.movements);
  assertHistory(before);
});

for (const source of orderStatuses) {
  for (const target of orderStatuses) {
    if ((source === "PLACED" && target === "PACKED") || (source === "PACKED" && target === "SHIPPED")) continue;
    test(`rejects fulfilment ${source} to ${target}`, async () => {
      db.update(orders).set({ status: source }).where(eq(orders.id, order.id)).run();
      await rejected(() => patchStatus({ status: target }), 409, "INVALID_TRANSITION");
    });
  }
}

for (const source of ["PLACED", "PACKED"] as const) {
  test(`${source} to CANCELLED restores all stock and records correct movements`, async () => {
    if (source === "PACKED") await successful(await patchStatus({ status: "PACKED" }), "PACKED");
    const before = state();
    await successful(await cancelOrder(), "CANCELLED");
    const current = state();
    assert.deepEqual(current.products.map((p) => p.stock), catalog.map((p) => p.stock));
    assert.equal(current.orders.length, 1);
    assertHistory(before, current);
    assert.deepEqual(current.movements.filter((m) => m.type === "ORDER_CANCELLED")
      .map(({ orderId, productId, quantity, type }) => ({ orderId, productId, quantity, type })), [
      { orderId: order.id, productId: catalog[0].id, quantity: 2, type: "ORDER_CANCELLED" },
      { orderId: order.id, productId: catalog[1].id, quantity: 1, type: "ORDER_CANCELLED" },
    ]);
    assert.deepEqual(db.$client.pragma("foreign_key_check"), []);
  });
}

for (const source of ["SHIPPED", "CANCELLED"] as const) {
  test(`rejects cancellation of ${source} orders`, async () => {
    db.update(orders).set({ status: source }).where(eq(orders.id, order.id)).run();
    await rejected(() => cancelOrder(), 409, "INVALID_TRANSITION");
  });
}

test("repeated cancellation never restores stock twice", async () => {
  await successful(await cancelOrder(), "CANCELLED");
  await rejected(() => cancelOrder(), 409, "INVALID_TRANSITION");
  await rejected(() => cancelOrder(), 409, "INVALID_TRANSITION");
  assert.equal(state().movements.filter((m) => m.type === "ORDER_CANCELLED").length, 2);
  assert.deepEqual(state().products.map((p) => p.stock), catalog.map((p) => p.stock));
});

test("restores only this order's quantities when another order has consumed stock", async () => {
  const second = createOrder({ items: [{ productId: catalog[0].id, quantity: 3 }] });
  const before = state();
  await successful(await cancelOrder(), "CANCELLED");
  assert.equal(state().products.find((p) => p.id === catalog[0].id)?.stock, 22);
  assert.equal(state().orders.find((o) => o.id === second.id)?.status, "PLACED");
  assert.equal(state().movements.filter((m) => m.orderId === second.id).length, 1);
  assertHistory(before);
});

test("cancellation preserves historical prices and totals after current prices change", async () => {
  db.update(products).set({ priceCents: 999 }).run();
  const before = state();
  await successful(await cancelOrder(), "CANCELLED");
  assertHistory(before);
  assert.ok(state().products.every((p) => p.priceCents === 999));
  assert.deepEqual(state().items.map((item) => item.unitPriceCents), [79900, 249900]);
  assert.equal(state().orders[0].totalCents, 409700);
});

for (const id of ["0", "-1", "1.5", "abc", "1e2", "9007199254740992", "1 OR 1=1", ""]) {
  test(`rejects invalid order ID ${JSON.stringify(id)} on both mutation endpoints`, async () => {
    await rejected(() => patchStatus({ status: "PACKED" }, id), 400, "VALIDATION_ERROR");
    await rejected(() => cancelOrder(id), 400, "VALIDATION_ERROR");
  });
}

test("returns 404 for nonexistent orders on both mutation endpoints", async () => {
  await rejected(() => patchStatus({ status: "PACKED" }, "999999"), 404, "NOT_FOUND");
  await rejected(() => cancelOrder("999999"), 404, "NOT_FOUND");
});

for (const body of [{}, null, [], { status: null }, { status: "INVALID" }, { status: 1 }, { status: "packed" }, { status: "PACKED", extra: true }]) {
  test(`rejects invalid status request ${JSON.stringify(body)}`, async () => {
    await rejected(() => patchStatus(body), 400, "VALIDATION_ERROR");
  });
}

test("rejects malformed or empty JSON status requests", async () => {
  for (const body of ["{", ""]) {
    await rejected(() => patch(new Request(`http://localhost/api/orders/${order.id}/status`, {
      method: "PATCH", body,
    }), { params: Promise.resolve({ id: String(order.id) }) }), 400, "VALIDATION_ERROR");
  }
});

test("rolls back cancellation if the order status update fails", async (context) => {
  context.mock.method(console, "error", () => {});
  db.$client.exec("CREATE TRIGGER inject_failure BEFORE UPDATE ON orders BEGIN SELECT RAISE(ABORT, 'private status failure'); END");
  await rejected(() => cancelOrder(), 500, "INTERNAL_SERVER_ERROR");
});

test("rolls back fulfilment if the order status update fails", async (context) => {
  context.mock.method(console, "error", () => {});
  db.$client.exec("CREATE TRIGGER inject_failure BEFORE UPDATE ON orders BEGIN SELECT RAISE(ABORT, 'private status failure'); END");
  await rejected(() => patchStatus({ status: "PACKED" }), 500, "INTERNAL_SERVER_ERROR");
});

test("rejects a conditional status update that affects no row", async () => {
  db.$client.exec("CREATE TRIGGER inject_failure BEFORE UPDATE ON orders BEGIN SELECT RAISE(IGNORE); END");
  await rejected(() => cancelOrder(), 409, "INVALID_TRANSITION");
  await rejected(() => patchStatus({ status: "PACKED" }), 409, "INVALID_TRANSITION");
});

test("rolls back status and earlier restorations when a later stock update fails", async (context) => {
  context.mock.method(console, "error", () => {});
  db.$client.exec(`CREATE TRIGGER inject_failure BEFORE UPDATE ON products
    WHEN OLD.id = ${catalog[1].id} BEGIN SELECT RAISE(ABORT, 'private restoration failure'); END`);
  await rejected(() => cancelOrder(), 500, "INTERNAL_SERVER_ERROR");
});

test("rolls back status, all restorations, and earlier movements on a late movement failure", async (context) => {
  context.mock.method(console, "error", () => {});
  db.$client.exec(`CREATE TRIGGER inject_failure BEFORE INSERT ON inventory_movements
    WHEN NEW.type = 'ORDER_CANCELLED' AND NEW.product_id = ${catalog[1].id}
    BEGIN SELECT RAISE(ABORT, 'private late movement failure'); END`);
  await rejected(() => cancelOrder(), 500, "INTERNAL_SERVER_ERROR");
});

test("rolls back everything if a conditional restoration affects no product", async () => {
  db.$client.exec(`CREATE TRIGGER inject_failure BEFORE UPDATE ON products
    WHEN OLD.id = ${catalog[1].id} BEGIN SELECT RAISE(IGNORE); END`);
  await rejected(() => cancelOrder(), 409, "INVENTORY_CONFLICT");
});

test("the movement unique constraint prevents duplicate restoration and rolls back prior items", async () => {
  db.insert(inventoryMovements).values({
    orderId: order.id, productId: catalog[1].id, type: "ORDER_CANCELLED", quantity: 1,
  }).run();
  await rejected(() => cancelOrder(), 409, "INVENTORY_CONFLICT");
  assert.equal(state().orders[0].status, "PLACED");
  assert.equal(state().movements.filter((m) => m.type === "ORDER_CANCELLED").length, 1);
});

test("rejects restoration overflow and rolls back earlier item restorations", async () => {
  db.update(products).set({ stock: Number.MAX_SAFE_INTEGER }).where(eq(products.id, catalog[1].id)).run();
  await rejected(() => cancelOrder(), 409, "INVENTORY_CONFLICT");
});

test("both endpoints return inventory conflicts on writer-lock timeout without changing rows", async () => {
  const blocker = connect(process.env.DATABASE_PATH!);
  blocker.$client.exec("BEGIN IMMEDIATE");
  db.$client.pragma("busy_timeout = 10");
  try {
    await rejected(() => patchStatus({ status: "PACKED" }), 409, "INVENTORY_CONFLICT");
    await rejected(() => cancelOrder(), 409, "INVENTORY_CONFLICT");
  } finally {
    blocker.$client.exec("ROLLBACK");
    blocker.$client.close();
    db.$client.pragma("busy_timeout = 5000");
  }
});

type WorkerRequest = { id: string; operation: "cancel" | "status"; status?: string };
function transitionWorker() {
  const child = spawn(process.execPath, ["--import", "tsx", "tests/helpers/order-transition-worker.ts"], {
    env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  let readyResolve: () => void;
  const ready = new Promise<void>((resolve) => { readyResolve = resolve; });
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
    if (output.includes("READY\n")) readyResolve();
  });
  child.stderr.on("data", (chunk) => { errors += String(chunk); });
  const result = new Promise<{ status: number; body: ApiSuccess<JsonOrder> | ApiError }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      readyResolve();
      if (code !== 0) return reject(new Error(`Transition worker exited ${code}: ${errors}`));
      try { resolve(JSON.parse(output.trim().split("\n").at(-1)!)); }
      catch (error) { reject(error); }
    });
  });
  void result.catch(() => {});
  return { child, ready, result };
}

async function compete(requests: WorkerRequest[]) {
  const workers = requests.map(transitionWorker);
  try {
    await Promise.all(workers.map((worker) => worker.ready));
    db.$client.exec("BEGIN IMMEDIATE");
    try {
      workers.forEach((worker, index) => worker.child.stdin.end(JSON.stringify(requests[index]) + "\n"));
      await delay(150);
    } finally { db.$client.exec("ROLLBACK"); }
    return await Promise.all(workers.map((worker) => worker.result));
  } finally {
    for (const worker of workers) if (worker.child.exitCode === null) worker.child.kill();
  }
}

test("four concurrent cancellation processes restore all stock exactly once", { timeout: 20000 }, async () => {
  const before = state();
  const results = await compete(Array.from({ length: 4 }, () => ({ id: String(order.id), operation: "cancel" })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409, 409, 409]);
  for (const result of results.filter((result) => result.status === 409)) {
    assert.equal((result.body as ApiError).error.code, "INVALID_TRANSITION");
  }
  const current = state();
  assert.equal(current.orders[0].status, "CANCELLED");
  assert.deepEqual(current.products.map((p) => p.stock), catalog.map((p) => p.stock));
  assert.equal(current.movements.filter((m) => m.type === "ORDER_CANCELLED").length, 2);
  assert.deepEqual(current.movements.filter((m) => m.type === "ORDER_CANCELLED").map((m) => m.quantity), [2, 1]);
  assertHistory(before, current);
  assert.deepEqual(db.$client.pragma("foreign_key_check"), []);
});

test("concurrent duplicate fulfilment requests advance status only once", { timeout: 20000 }, async () => {
  const before = state();
  const results = await compete(Array.from({ length: 2 }, () => ({ id: String(order.id), operation: "status", status: "PACKED" })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(state().orders[0].status, "PACKED");
  assert.deepEqual(state().products, before.products);
  assert.deepEqual(state().movements, before.movements);
  assertHistory(before);
});

test("concurrent shipping and cancellation produce one valid outcome", { timeout: 20000 }, async () => {
  await successful(await patchStatus({ status: "PACKED" }), "PACKED");
  const before = state();
  const results = await compete([
    { id: String(order.id), operation: "status", status: "SHIPPED" },
    { id: String(order.id), operation: "cancel" },
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const current = state();
  if (current.orders[0].status === "SHIPPED") {
    assert.deepEqual(current.products, before.products);
    assert.deepEqual(current.movements, before.movements);
  } else {
    assert.equal(current.orders[0].status, "CANCELLED");
    assert.deepEqual(current.products.map((p) => p.stock), catalog.map((p) => p.stock));
    assert.equal(current.movements.filter((m) => m.type === "ORDER_CANCELLED").length, 2);
  }
  assertHistory(before, current);
});
