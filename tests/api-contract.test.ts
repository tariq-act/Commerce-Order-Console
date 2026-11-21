import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { z } from "zod";
import { inventoryMovementTypes, orderStatuses, products } from "../src/db/schema";
import type { Database, NewProduct, Product } from "../src/db/types";
import type { CreatedOrder } from "../src/services/order.service";

// Runtime contract assertions complement the existing business-rule tests.
const integer = z.number().int().nonnegative();
const id = z.number().int().positive();
const date = z.iso.datetime();
const summarySchema = z.strictObject({
  id,
  reference: z.string(),
  status: z.enum(orderStatuses),
  totalCents: integer,
  createdAt: date,
});
const productSchema = z.strictObject({
  id,
  name: z.string(),
  sku: z.string(),
  description: z.string(),
  priceCents: integer,
  stock: integer,
  createdAt: date,
  updatedAt: date,
});
const inventorySchema = z.strictObject({
  id,
  name: z.string(),
  sku: z.string(),
  priceCents: integer,
  stock: integer,
  availability: z.enum(["in_stock", "out_of_stock"]),
});
const createdItemSchema = z.strictObject({
  productId: id,
  productName: z.string(),
  quantity: id,
  unitPriceCents: integer,
});
const paginationSchema = z.strictObject({
  page: id,
  limit: id,
  total: integer,
  totalPages: integer,
});
const errorSchema = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    code: z.enum([
      "VALIDATION_ERROR",
      "NOT_FOUND",
      "INSUFFICIENT_STOCK",
      "INVENTORY_CONFLICT",
      "INVALID_TRANSITION",
      "INTERNAL_SERVER_ERROR",
    ]),
    message: z.string().min(1),
    details: z
      .array(z.strictObject({ field: z.string().min(1), message: z.string().min(1) }))
      .optional(),
  }),
});

let db: Database;
let catalog: Product[];
let fixtures: NewProduct[];
let order: CreatedOrder;
let directory: string;
let createOrder: typeof import("../src/services/order.service").createOrder;
let productRoutes: typeof import("../src/app/api/products/route");
let productDetail: typeof import("../src/app/api/products/[id]/route");
let orderRoutes: typeof import("../src/app/api/orders/route");
let orderDetail: typeof import("../src/app/api/orders/[id]/route");
let statusRoute: typeof import("../src/app/api/orders/[id]/status/route");
let cancelRoute: typeof import("../src/app/api/orders/[id]/cancel/route");
let inventoryRoutes: typeof import("../src/app/api/inventory/route");
let inventoryDetail: typeof import("../src/app/api/inventory/[productId]/route");
let movementRoute: typeof import("../src/app/api/inventory/[productId]/movements/route");
const originalPath = process.env.DATABASE_PATH;

before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-api-contract-"));
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
  ({ createOrder } = await import("../src/services/order.service"));
  productRoutes = await import("../src/app/api/products/route");
  productDetail = await import("../src/app/api/products/[id]/route");
  orderRoutes = await import("../src/app/api/orders/route");
  orderDetail = await import("../src/app/api/orders/[id]/route");
  statusRoute = await import("../src/app/api/orders/[id]/status/route");
  cancelRoute = await import("../src/app/api/orders/[id]/cancel/route");
  inventoryRoutes = await import("../src/app/api/inventory/route");
  inventoryDetail = await import("../src/app/api/inventory/[productId]/route");
  movementRoute = await import("../src/app/api/inventory/[productId]/movements/route");
});

beforeEach(() => {
  db.$client.exec(`
    DROP TRIGGER IF EXISTS contract_failure;
    DELETE FROM inventory_movements;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM products;
  `);
  catalog = db.insert(products).values(fixtures).returning().all();
  order = createOrder({ items: [{ productId: catalog[0].id, quantity: 1 }] });
});

after(() => {
  if (db?.$client.open) db.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalPath;
});

const request = (path: string, method = "GET", body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const orderContext = (value = String(order.id)) => ({ params: Promise.resolve({ id: value }) });
const productContext = () => ({ params: Promise.resolve({ id: String(catalog[0].id) }) });
const inventoryContext = () => ({ params: Promise.resolve({ productId: String(catalog[0].id) }) });

async function assertSuccess(response: Response, dataSchema: z.ZodType, status = 200) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body: unknown = await response.json();
  z.strictObject({ success: z.literal(true), data: dataSchema }).parse(body);
  assert.deepEqual(Object.keys(body as object).sort(), ["data", "success"]);
}

const successContracts = [
  {
    name: "GET /api/products",
    run: () => productRoutes.GET(request("/api/products")),
    schema: z.array(productSchema),
  },
  {
    name: "GET /api/products/[id]",
    run: () => productDetail.GET(request(`/api/products/${catalog[0].id}`), productContext()),
    schema: productSchema,
  },
  {
    name: "POST /api/orders",
    run: () =>
      orderRoutes.POST(
        request("/api/orders", "POST", { items: [{ productId: catalog[0].id, quantity: 2 }] }),
      ),
    schema: summarySchema.extend({ items: z.array(createdItemSchema) }),
    status: 201,
  },
  {
    name: "GET /api/orders",
    run: () => orderRoutes.GET(request("/api/orders")),
    schema: z.strictObject({ orders: z.array(summarySchema), pagination: paginationSchema }),
  },
  {
    name: "GET /api/orders/[id]",
    run: () => orderDetail.GET(request(`/api/orders/${order.id}`), orderContext()),
    schema: summarySchema.extend({
      items: z.array(createdItemSchema.extend({ id, sku: z.string(), subtotalCents: integer })),
    }),
  },
  {
    name: "PATCH /api/orders/[id]/status",
    run: () =>
      statusRoute.PATCH(
        request(`/api/orders/${order.id}/status`, "PATCH", { status: "PACKED" }),
        orderContext(),
      ),
    schema: summarySchema.extend({ updatedAt: date }),
  },
  {
    name: "POST /api/orders/[id]/cancel",
    run: () => cancelRoute.POST(request(`/api/orders/${order.id}/cancel`, "POST"), orderContext()),
    schema: summarySchema.extend({ updatedAt: date }),
  },
  {
    name: "GET /api/inventory",
    run: () => inventoryRoutes.GET(request("/api/inventory")),
    schema: z.array(inventorySchema),
  },
  {
    name: "GET /api/inventory/[productId]",
    run: () => inventoryDetail.GET(request(`/api/inventory/${catalog[0].id}`), inventoryContext()),
    schema: inventorySchema,
  },
  {
    name: "GET /api/inventory/[productId]/movements",
    run: () =>
      movementRoute.GET(request(`/api/inventory/${catalog[0].id}/movements`), inventoryContext()),
    schema: z.strictObject({
      product: inventorySchema,
      movements: z.array(
        z.strictObject({
          id,
          productId: id,
          orderId: id,
          orderReference: z.string(),
          type: z.enum(inventoryMovementTypes),
          quantity: id,
          createdAt: date,
        }),
      ),
      pagination: paginationSchema,
    }),
  },
];

for (const contract of successContracts) {
  test(`${contract.name} preserves its documented success response contract`, async () => {
    await assertSuccess(await contract.run(), contract.schema, contract.status ?? 200);
  });
}

const errorContracts = [
  {
    name: "invalid quantity",
    status: 400,
    code: "VALIDATION_ERROR",
    run: () =>
      orderRoutes.POST(
        request("/api/orders", "POST", { items: [{ productId: catalog[0].id, quantity: 0 }] }),
      ),
  },
  {
    name: "missing order",
    status: 404,
    code: "NOT_FOUND",
    run: () => orderDetail.GET(request("/api/orders/999999"), orderContext("999999")),
  },
  {
    name: "insufficient stock",
    status: 409,
    code: "INSUFFICIENT_STOCK",
    run: () =>
      orderRoutes.POST(
        request("/api/orders", "POST", { items: [{ productId: catalog[0].id, quantity: 999 }] }),
      ),
  },
  {
    name: "disallowed fulfilment",
    status: 409,
    code: "INVALID_TRANSITION",
    run: () =>
      statusRoute.PATCH(
        request(`/api/orders/${order.id}/status`, "PATCH", { status: "SHIPPED" }),
        orderContext(),
      ),
  },
  {
    name: "invalid inventory query",
    status: 400,
    code: "VALIDATION_ERROR",
    run: () => inventoryRoutes.GET(request("/api/inventory?stock=invalid")),
  },
  {
    name: "invalid pagination",
    status: 400,
    code: "VALIDATION_ERROR",
    run: () =>
      movementRoute.GET(
        request(`/api/inventory/${catalog[0].id}/movements?limit=101`),
        inventoryContext(),
      ),
  },
];

for (const contract of errorContracts) {
  test(`${contract.name} preserves its documented error envelope and HTTP status`, async () => {
    const response = await contract.run();
    assert.equal(response.status, contract.status);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = errorSchema.parse(await response.json());
    assert.equal(body.error.code, contract.code);
    if (body.error.code === "VALIDATION_ERROR") assert.ok(body.error.details?.length);
  });
}

test("unexpected database errors preserve the safe 500 contract", async (context) => {
  context.mock.method(console, "error", () => {});
  db.$client.exec(
    "CREATE TRIGGER contract_failure BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT, 'private database failure'); END",
  );
  const response = await orderRoutes.POST(
    request("/api/orders", "POST", { items: [{ productId: catalog[0].id, quantity: 1 }] }),
  );
  assert.equal(response.status, 500);
  assert.deepEqual(errorSchema.parse(await response.json()), {
    success: false,
    error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
  });
});
