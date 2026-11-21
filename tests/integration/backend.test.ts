import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import BetterSqlite3 from "better-sqlite3";
import type { Product } from "../../src/db/types";
import type { ApiError, ApiSuccess } from "../../src/lib/api-response";
import type { InventoryMovementPage, InventoryRecord } from "../../src/services/inventory.service";
import type { CreatedOrder } from "../../src/services/order.service";
import type { OrderDetails, OrderPage } from "../../src/services/order-query.service";

type JsonProduct = Omit<Product, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
type JsonOrder = Omit<CreatedOrder, "createdAt"> & { createdAt: string };
type JsonDetails = Omit<OrderDetails, "createdAt"> & { createdAt: string };
type JsonHistory = Omit<InventoryMovementPage, "movements"> & {
  movements: (Omit<InventoryMovementPage["movements"][number], "createdAt"> & {
    createdAt: string;
  })[];
};
const tables = ["products", "orders", "order_items", "inventory_movements"] as const;

describe("production HTTP backend audit", { concurrency: false }, () => {
  let directory: string;
  let environment: NodeJS.ProcessEnv;
  let inspection: BetterSqlite3.Database;
  let development: BetterSqlite3.Database | undefined;
  let originalDevelopment: ReturnType<typeof snapshot>;
  let server: ChildProcess | undefined;
  let closed: Promise<void> | undefined;
  let baseUrl: string;
  let catalog: JsonProduct[];
  let fulfilled: JsonOrder;
  let cancelled: JsonOrder;
  let httpChecks = 0;

  function snapshot(client = inspection) {
    return Object.fromEntries(
      tables.map((table) => [table, client.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]),
    ) as Record<(typeof tables)[number], unknown[]>;
  }

  function runScript(script: string) {
    return execFileSync(process.execPath, ["--import", "tsx", script], {
      env: environment,
      encoding: "utf8",
      timeout: 30000,
    });
  }

  async function startServer() {
    let logs = "";
    let startupError: Error | undefined;
    const child = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "0"],
      { env: environment, stdio: ["ignore", "pipe", "pipe"] },
    );
    server = child;
    closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    child.on("error", (error) => {
      startupError = error;
    });
    child.stdout.on("data", (chunk) => {
      logs += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      logs += String(chunk);
    });
    for (let attempt = 0; attempt < 300; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`Next.js exited before startup: ${logs}`);
      const address = logs.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (logs.includes("Ready in") && address && Number(address[1]) > 0) {
        baseUrl = address[0];
        return;
      }
      await delay(50);
    }
    throw new Error(`Next.js startup timed out: ${logs}`);
  }

  async function stopServer() {
    const child = server;
    if (!child) return;
    child.kill("SIGTERM");
    await Promise.race([closed, delay(5000, undefined, { ref: false })]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await closed;
    }
    server = undefined;
  }

  async function request(
    method: string,
    path: string,
    status: number,
    body?: unknown,
    raw = false,
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : raw ? String(body) : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    httpChecks += 1;
    assert.equal(response.status, status, `${method} ${path}: ${text}`);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = JSON.parse(text) as ApiSuccess<unknown> | ApiError;
    assert.equal(result.success, status < 400);
    return result;
  }

  async function success<T>(
    method: string,
    path: string,
    status = 200,
    body?: unknown,
  ): Promise<T> {
    const result = await request(method, path, status, body);
    assert.ok(result.success);
    return result.data as T;
  }

  async function failure(
    method: string,
    path: string,
    status: number,
    code: ApiError["error"]["code"],
    body?: unknown,
    raw = false,
  ) {
    const result = await request(method, path, status, body, raw);
    assert.equal(result.success, false);
    if (result.success) throw new Error("Expected an API error");
    assert.equal(result.error.code, code);
    if (status === 500)
      assert.deepEqual(result, {
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
      });
  }

  function product(sku: string) {
    const value = catalog.find((item) => item.sku === sku);
    assert.ok(value);
    return value;
  }

  async function mouseStock() {
    return (await success<InventoryRecord>("GET", `/api/inventory/${product("ACC-001").id}`)).stock;
  }

  before(async () => {
    // Read development data only, so the audit can prove it did not change.
    const { databasePath } = await import("../../src/db/config");
    if (existsSync(databasePath)) {
      development = new BetterSqlite3(databasePath, { readonly: true });
      originalDevelopment = snapshot(development);
    }
    directory = mkdtempSync(join(tmpdir(), "commerce-backend-audit-"));
    environment = {
      ...process.env,
      DATABASE_PATH: join(directory, "audit.db"),
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    runScript("src/db/migrate.ts");
    runScript("src/db/seed.ts");
    inspection = new BetterSqlite3(environment.DATABASE_PATH!);
    inspection.pragma("foreign_keys = ON");
    await startServer();
    catalog = await success<JsonProduct[]>("GET", "/api/products");
    assert.equal(catalog.length, 6);
  });

  after(async () => {
    try {
      await stopServer();
      if (development) {
        assert.deepEqual(snapshot(development), originalDevelopment);
        console.log("Development database rows verified unchanged.");
      }
      console.log(`${httpChecks} production HTTP requests checked.`);
    } finally {
      if (inspection?.open) inspection.close();
      development?.close();
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  });

  test("workflow A: fulfil two mice, reject shipped cancellation, retain stock 23", async () => {
    assert.equal(await mouseStock(), 25);
    fulfilled = await success<JsonOrder>("POST", "/api/orders", 201, {
      items: [{ productId: String(product("ACC-001").id), quantity: 2 }],
    });
    assert.equal(fulfilled.status, "PLACED");
    assert.equal(await mouseStock(), 23);
    const details = await success<JsonDetails>("GET", `/api/orders/${fulfilled.id}`);
    assert.equal(details.items.length, 1);
    assert.equal(details.items[0].quantity, 2);
    assert.equal(details.items[0].unitPriceCents, 79900);
    assert.equal(details.items[0].subtotalCents, 159800);
    assert.equal(details.totalCents, 159800);
    const packed = await success<JsonOrder>("PATCH", `/api/orders/${fulfilled.id}/status`, 200, {
      status: "PACKED",
    });
    assert.equal(packed.status, "PACKED");
    const shipped = await success<JsonOrder>("PATCH", `/api/orders/${fulfilled.id}/status`, 200, {
      status: "SHIPPED",
    });
    assert.equal(shipped.status, "SHIPPED");
    const before = snapshot();
    await failure("POST", `/api/orders/${fulfilled.id}/cancel`, 409, "INVALID_TRANSITION");
    assert.deepEqual(snapshot(), before);
    assert.equal(await mouseStock(), 23);
  });

  test("workflow B: order three mice from stock 23, cancel exactly once, restore 23", async () => {
    assert.equal(await mouseStock(), 23);
    cancelled = await success<JsonOrder>("POST", "/api/orders", 201, {
      items: [{ productId: product("ACC-001").id, quantity: 3 }],
    });
    assert.equal(await mouseStock(), 20);
    const result = await success<JsonOrder>("POST", `/api/orders/${cancelled.id}/cancel`);
    assert.equal(result.status, "CANCELLED");
    assert.equal(await mouseStock(), 23);
    const before = snapshot();
    await failure("POST", `/api/orders/${cancelled.id}/cancel`, 409, "INVALID_TRANSITION");
    assert.equal(await mouseStock(), 23);
    assert.deepEqual(snapshot(), before);
    const history = await success<JsonHistory>(
      "GET",
      `/api/inventory/${product("ACC-001").id}/movements`,
    );
    const restorations = history.movements.filter(
      (movement) => movement.orderId === cancelled.id && movement.type === "ORDER_CANCELLED",
    );
    assert.equal(restorations.length, 1);
    assert.equal(restorations[0].quantity, 3);
    assert.equal(restorations[0].orderReference, cancelled.reference);
  });

  test("workflow C: two available products plus webcam reject the complete order", async () => {
    const mouse = product("ACC-001");
    const keyboard = product("ACC-002");
    const webcam = product("ACC-005");
    assert.equal(await mouseStock(), 23);
    assert.equal(
      (await success<InventoryRecord>("GET", `/api/inventory/${keyboard.id}`)).stock,
      10,
    );
    assert.equal((await success<InventoryRecord>("GET", `/api/inventory/${webcam.id}`)).stock, 0);
    const before = snapshot();
    await failure("POST", "/api/orders", 409, "INSUFFICIENT_STOCK", {
      items: [
        { productId: mouse.id, quantity: 1 },
        { productId: keyboard.id, quantity: 1 },
        { productId: webcam.id, quantity: 1 },
      ],
    });
    assert.deepEqual(snapshot(), before);
    assert.equal(before.orders.length, 2);
    assert.equal(before.order_items.length, 2);
    assert.equal(before.inventory_movements.length, 3);
  });

  test("all product, order, and inventory read routes expose consistent filtered data", async () => {
    const before = snapshot();
    const mouse = product("ACC-001");
    assert.equal((await success<JsonProduct>("GET", `/api/products/${mouse.id}`)).stock, 23);
    assert.equal(
      (await success<JsonProduct[]>("GET", "/api/products?search=acc-005&stock=out_of_stock"))
        .length,
      1,
    );
    assert.equal(
      (await success<InventoryRecord[]>("GET", "/api/inventory?search=mouse&stock=in_stock"))[0]
        .stock,
      23,
    );
    const orders = await success<OrderPage>(
      "GET",
      `/api/orders?search=${encodeURIComponent(fulfilled.reference)}&status=SHIPPED&limit=1`,
    );
    assert.equal(orders.orders.length, 1);
    assert.equal(orders.orders[0].id, fulfilled.id);
    assert.deepEqual(orders.pagination, { page: 1, limit: 1, total: 1, totalPages: 1 });
    assert.equal(
      (await success<JsonDetails>("GET", `/api/orders/${cancelled.id}`)).status,
      "CANCELLED",
    );
    const history = await success<JsonHistory>(
      "GET",
      `/api/inventory/${mouse.id}/movements?limit=2`,
    );
    assert.equal(history.movements.length, 2);
    assert.equal(history.pagination.total, 3);
    assert.equal(history.movements[0].type, "ORDER_CANCELLED");
    assert.deepEqual(snapshot(), before);
  });

  test("late placement failure rolls back order, items, deductions, and movements with safe 500 JSON", async () => {
    const keyboard = product("ACC-002");
    inspection.exec(`CREATE TRIGGER audit_failure BEFORE INSERT ON inventory_movements
      WHEN NEW.type = 'ORDER_PLACED' AND NEW.product_id = ${keyboard.id}
      BEGIN SELECT RAISE(ABORT, 'private audit placement failure'); END`);
    try {
      const before = snapshot();
      await failure("POST", "/api/orders", 500, "INTERNAL_SERVER_ERROR", {
        items: [
          { productId: product("ACC-001").id, quantity: 1 },
          { productId: keyboard.id, quantity: 1 },
        ],
      });
      assert.deepEqual(snapshot(), before);
    } finally {
      inspection.exec("DROP TRIGGER audit_failure");
    }
  });

  test("late cancellation failure rolls back all restoration and supports a clean retry", async () => {
    const keyboard = product("ACC-002");
    const order = await success<JsonOrder>("POST", "/api/orders", 201, {
      items: [
        { productId: product("ACC-001").id, quantity: 1 },
        { productId: keyboard.id, quantity: 1 },
      ],
    });
    inspection.exec(`CREATE TRIGGER audit_failure BEFORE INSERT ON inventory_movements
      WHEN NEW.type = 'ORDER_CANCELLED' AND NEW.product_id = ${keyboard.id}
      BEGIN SELECT RAISE(ABORT, 'private audit cancellation failure'); END`);
    try {
      const before = snapshot();
      await failure("POST", `/api/orders/${order.id}/cancel`, 500, "INTERNAL_SERVER_ERROR");
      assert.deepEqual(snapshot(), before);
    } finally {
      inspection.exec("DROP TRIGGER audit_failure");
    }
    assert.equal(
      (await success<JsonOrder>("POST", `/api/orders/${order.id}/cancel`)).status,
      "CANCELLED",
    );
    assert.equal(await mouseStock(), 23);
  });

  test("stored unit prices and totals survive current product price changes", async () => {
    const before = await success<JsonDetails>("GET", `/api/orders/${fulfilled.id}`);
    inspection
      .prepare("UPDATE products SET price_cents = ? WHERE id = ?")
      .run(99900, product("ACC-001").id);
    assert.equal(
      (await success<InventoryRecord>("GET", `/api/inventory/${product("ACC-001").id}`)).priceCents,
      99900,
    );
    assert.deepEqual(await success<JsonDetails>("GET", `/api/orders/${fulfilled.id}`), before);
    assert.equal(before.items[0].unitPriceCents, 79900);
    assert.equal(before.totalCents, 159800);
  });

  test("repeat migrations and seeding preserve stock, prices, rows, and schema integrity", () => {
    const before = snapshot();
    runScript("src/db/migrate.ts");
    runScript("src/db/migrate.ts");
    assert.match(runScript("src/db/seed.ts"), /0 inserted, 6 already present/);
    assert.match(runScript("src/db/seed.ts"), /0 inserted, 6 already present/);
    assert.deepEqual(snapshot(), before);
    const verification = runScript("src/db/verify.ts");
    assert.match(verification, /41 invalid-write checks/);
    assert.match(verification, /Foreign key definitions|foreign key definitions/);
    console.log(verification.trim());
    assert.deepEqual(inspection.pragma("foreign_key_check"), []);
    assert.equal(inspection.pragma("integrity_check", { simple: true }), "ok");
  });

  test("400, 404, and 409 error contracts validate inputs and reject illegal transitions", async () => {
    const before = snapshot();
    await failure("POST", "/api/orders", 400, "VALIDATION_ERROR", { items: [] });
    await failure("POST", "/api/orders", 400, "VALIDATION_ERROR", "{", true);
    await failure("GET", "/api/orders?status=INVALID", 400, "VALIDATION_ERROR");
    await failure("GET", "/api/orders?limit=101", 400, "VALIDATION_ERROR");
    await failure("GET", "/api/products?stock=invalid", 400, "VALIDATION_ERROR");
    await failure("GET", "/api/products/invalid-id", 400, "VALIDATION_ERROR");
    await failure("GET", "/api/inventory/1/movements?page=0", 400, "VALIDATION_ERROR");
    await failure("GET", "/api/orders/999999", 404, "NOT_FOUND");
    await failure("GET", "/api/products/999999", 404, "NOT_FOUND");
    await failure("GET", "/api/inventory/999999/movements", 404, "NOT_FOUND");
    await failure("PATCH", `/api/orders/${fulfilled.id}/status`, 409, "INVALID_TRANSITION", {
      status: "PACKED",
    });
    assert.deepEqual(snapshot(), before);
  });

  test("application restart preserves statuses, stock, prices, totals, items, and movements", async () => {
    const before = snapshot();
    const previousPid = server?.pid;
    const orderBefore = await success<JsonDetails>("GET", `/api/orders/${fulfilled.id}`);
    const inventoryBefore = await success<InventoryRecord>(
      "GET",
      `/api/inventory/${product("ACC-001").id}`,
    );
    const historyBefore = await success<JsonHistory>(
      "GET",
      `/api/inventory/${product("ACC-001").id}/movements`,
    );
    await stopServer();
    await startServer();
    assert.notEqual(server?.pid, previousPid);
    assert.deepEqual(await success<JsonDetails>("GET", `/api/orders/${fulfilled.id}`), orderBefore);
    assert.deepEqual(
      await success<InventoryRecord>("GET", `/api/inventory/${product("ACC-001").id}`),
      inventoryBefore,
    );
    assert.deepEqual(
      await success<JsonHistory>("GET", `/api/inventory/${product("ACC-001").id}/movements`),
      historyBefore,
    );
    assert.equal(
      (await success<JsonDetails>("GET", `/api/orders/${cancelled.id}`)).status,
      "CANCELLED",
    );
    await failure("POST", `/api/orders/${cancelled.id}/cancel`, 409, "INVALID_TRANSITION");
    assert.equal(await mouseStock(), 23);
    assert.deepEqual(snapshot(), before);
  });
});
