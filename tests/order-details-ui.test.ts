import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, beforeEach, after, test, type TestContext } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { products, orders, inventoryMovements } from "../src/db/schema";
import type { Database } from "../src/db/types";
import { apiGet, ApiClientError } from "../src/lib/api-client";
import {
  canChangeOrderStatus,
  submitOrderAction,
  orderActionError,
  type OrderAction,
} from "../src/features/orders/actions";
import {
  orderDetailsSchema,
  orderStatusValues,
  type OrderDetailsResponse,
} from "../src/features/orders/types/order";
import {
  cacheUpdatedOrder,
  refreshOrderCaches,
} from "../src/features/orders/hooks/use-order-details";
import { OrderDetails, parseOrderId } from "../src/features/orders/components/order-details";
import { OrderFulfilment } from "../src/features/orders/components/order-fulfilment";
import { OrderTimeline } from "../src/features/orders/components/order-timeline";
import { OrderItems } from "../src/features/orders/components/order-items";

let db: Database;
let directory: string;
let service: typeof import("../src/services/order.service");
let detailRoute: typeof import("../src/app/api/orders/[id]/route").GET;
let statusRoute: typeof import("../src/app/api/orders/[id]/status/route").PATCH;
let cancelRoute: typeof import("../src/app/api/orders/[id]/cancel/route").POST;
let order: OrderDetailsResponse;
const originalPath = process.env.DATABASE_PATH;
before(async () => {
  directory = mkdtempSync(join(tmpdir(), "commerce-order-details-ui-"));
  process.env.DATABASE_PATH = join(directory, "test.db");
  ({ db } = await import("../src/db"));
  const { migrationsPath } = await import("../src/db/config");
  migrate(db, { migrationsFolder: migrationsPath });
  execFileSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
    env: process.env,
    stdio: "pipe",
  });
  service = await import("../src/services/order.service");
  ({ GET: detailRoute } = await import("../src/app/api/orders/[id]/route"));
  ({ PATCH: statusRoute } = await import("../src/app/api/orders/[id]/status/route"));
  ({ POST: cancelRoute } = await import("../src/app/api/orders/[id]/cancel/route"));
});
beforeEach(async () => {
  db.$client.exec("DELETE FROM inventory_movements; DELETE FROM order_items; DELETE FROM orders;");
  db.update(products)
    .set({ stock: 25, priceCents: 79900 })
    .where(eq(products.sku, "ACC-001"))
    .run();
  db.update(products).set({ stock: 10 }).where(eq(products.sku, "ACC-002")).run();
  const catalog = db.select().from(products).all();
  const created = service.createOrder({
    items: [
      { productId: catalog[0].id, quantity: 2 },
      { productId: catalog[1].id, quantity: 1 },
    ],
  });
  const response = await detailRoute(new Request("http://localhost"), {
    params: Promise.resolve({ id: String(created.id) }),
  });
  order = orderDetailsSchema.parse((await response.json()).data);
});
after(() => {
  db?.$client.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalPath;
});
function routeFetch(t: TestContext) {
  return t.mock.method(globalThis, "fetch", async (path: string, options?: RequestInit) => {
    const url = new URL(path, "http://localhost");
    const request = new Request(url, options);
    const context = { params: Promise.resolve({ id: url.pathname.split("/")[3] }) };
    if (options?.method === "PATCH") return statusRoute(request, context);
    if (options?.method === "POST") return cancelRoute(request, context);
    return detailRoute(request, context);
  });
}
function markup(status: OrderDetailsResponse["status"], pending = false, refreshing = false) {
  return renderToStaticMarkup(
    createElement(OrderFulfilment, {
      order: { ...order, status },
      pending,
      refreshing,
      onAction: async () => true,
    }),
  );
}

for (const source of orderStatusValues) {
  for (const target of ["PACKED", "SHIPPED", "CANCELLED"] as const) {
    const allowed =
      (source === "PLACED" && (target === "PACKED" || target === "CANCELLED")) ||
      (source === "PACKED" && (target === "SHIPPED" || target === "CANCELLED"));
    test(`${source} → ${target}: UI availability agrees with the actual API (${allowed ? "success" : "rejected"})`, async (t) => {
      routeFetch(t);
      if (source === "PACKED" || source === "SHIPPED")
        service.updateOrderStatus(String(order.id), { status: "PACKED" });
      if (source === "SHIPPED") service.updateOrderStatus(String(order.id), { status: "SHIPPED" });
      if (source === "CANCELLED") service.cancelOrder(String(order.id));
      assert.equal(canChangeOrderStatus(source, target), allowed);
      const label: Record<OrderAction, string> = {
        PACKED: "Mark as packed",
        SHIPPED: "Mark as shipped",
        CANCELLED: "Cancel order",
      };
      const button = markup(source)
        .match(new RegExp(`<button[^>]*>[\\s\\S]*?${label[target]}</button>`, "g"))
        ?.at(-1);
      assert.ok(button);
      // Inspect just this button, excluding earlier sibling buttons.
      const opening = button.slice(button.lastIndexOf("<button"));
      assert.equal(opening.includes('disabled=""'), !allowed);
      const stockBefore = db
        .select()
        .from(products)
        .all()
        .map((p) => p.stock);
      if (!allowed) {
        await assert.rejects(
          submitOrderAction(order.id, target),
          (error: unknown) =>
            error instanceof ApiClientError &&
            error.status === 409 &&
            error.code === "INVALID_TRANSITION",
        );
        assert.equal(db.select().from(orders).get()?.status, source);
        assert.deepEqual(
          db
            .select()
            .from(products)
            .all()
            .map((p) => p.stock),
          stockBefore,
        );
      } else {
        const updated = await submitOrderAction(order.id, target);
        assert.equal(updated.status, target);
        assert.equal(updated.totalCents, order.totalCents);
        assert.equal(updated.reference, order.reference);
        assert.ok(updated.updatedAt);
        const currentStock = db
          .select()
          .from(products)
          .all()
          .map((p) => p.stock);
        assert.deepEqual(
          currentStock,
          target === "CANCELLED"
            ? stockBefore.map((stock, index) => stock + (index === 0 ? 2 : index === 1 ? 1 : 0))
            : stockBefore,
        );
      }
    });
  }
}

test("details use historical prices, SKU, quantity, subtotal and total after current prices change", async (t) => {
  routeFetch(t);
  db.update(products)
    .set({ priceCents: 123 })
    .where(eq(products.id, order.items[0].productId))
    .run();
  const actual = await apiGet(`/api/orders/${order.id}`, orderDetailsSchema);
  assert.deepEqual(actual, order);
  const html = renderToStaticMarkup(createElement(OrderItems, { order: actual }));
  for (const value of [
    "Wireless Mouse",
    "Mechanical Keyboard",
    "ACC-001",
    "ACC-002",
    "₹799.00",
    "₹1,598.00",
    "₹2,499.00",
    "₹4,097.00",
    "2 products",
  ])
    assert.ok(html.includes(value), value);
  // Separate valid quantities can exceed the safe aggregate count on free products.
  const freeOrder = {
    ...actual,
    totalCents: 0,
    items: actual.items.map((item) => ({
      ...item,
      quantity: Number.MAX_SAFE_INTEGER,
      unitPriceCents: 0,
      subtotalCents: 0,
    })),
  };
  assert.doesNotThrow(() => renderToStaticMarkup(createElement(OrderItems, { order: freeOrder })));
});
test("the timeline reflects every status without inventing event timestamps or packing before cancellation", () => {
  for (const status of orderStatusValues) {
    const html = renderToStaticMarkup(createElement(OrderTimeline, { status }));
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
    assert.match(html, /Current status/);
    if (status === "CANCELLED") {
      assert.doesNotMatch(html, /Packed|Shipped/);
      assert.match(html, /inventory has been restored/);
    }
    assert.doesNotMatch(html, /<time/);
  }
});
test("all mutation controls are disabled during a pending mutation or status refresh", () => {
  for (const [pending, refreshing] of [
    [true, false],
    [false, true],
  ]) {
    const html = markup("PLACED", pending, refreshing);
    assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
  }
});
test("confirmation is not open and cancellation is never submitted on initial render", () => {
  let submissions = 0;
  const html = renderToStaticMarkup(
    createElement(OrderFulfilment, {
      order,
      pending: false,
      refreshing: false,
      onAction: async () => {
        submissions++;
        return true;
      },
    }),
  );
  assert.equal(submissions, 0);
  assert.doesNotMatch(html, /Confirm cancellation/);
});
test("successful mutations update the shared detail cache without losing items and invalidate all affected screens", async (t) => {
  routeFetch(t);
  const client = new QueryClient();
  client.setQueryData(["orders", "detail", order.id], order);
  for (const key of ["orders", "products", "inventory", "dashboard"])
    client.setQueryData([key, "test"], { value: true });
  const updated = await submitOrderAction(order.id, "PACKED");
  cacheUpdatedOrder(client, updated);
  const cached = client.getQueryData<OrderDetailsResponse>(["orders", "detail", order.id]);
  assert.equal(cached?.status, "PACKED");
  assert.deepEqual(cached?.items, order.items);
  assert.equal(cached?.totalCents, order.totalCents);
  refreshOrderCaches(client);
  for (const key of ["orders", "products", "inventory", "dashboard"])
    assert.equal(client.getQueryState([key, "test"])?.isInvalidated, true);
  client.clear();
});
test("invalid IDs, loading, 404 and safe retry states render correctly", () => {
  for (const id of ["", "0", "-1", "1.5", "abc", "1e2", "9007199254740992"])
    assert.equal(parseOrderId(id), null);
  assert.equal(parseOrderId("001"), 1);
  const render = (client: QueryClient, id: string) =>
    renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(OrderDetails, { id })),
    );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  assert.match(render(client, "abc"), /Invalid order ID/);
  assert.match(render(client, "123"), /Loading order details/);
  for (const status of [404, 500]) {
    const key = ["orders", "detail", 123];
    client
      .getQueryCache()
      .build(client, { queryKey: key })
      .setState({
        status: "error",
        error: new ApiClientError("INTERNAL SQL SECRET", status),
        fetchStatus: "idle",
      });
    const html = render(client, "123");
    assert.match(html, status === 404 ? /Order not found/ : /Order details are unavailable/);
    if (status === 500) assert.match(html, /Try again/);
    assert.doesNotMatch(html, /INTERNAL SQL SECRET/);
  }
  client.clear();
});
test("repeated cancellation keeps inventory and historical items unchanged", async (t) => {
  routeFetch(t);
  await submitOrderAction(order.id, "CANCELLED");
  const before = db.select().from(products).all();
  await assert.rejects(
    submitOrderAction(order.id, "CANCELLED"),
    (error: unknown) => error instanceof ApiClientError && error.status === 409,
  );
  assert.deepEqual(db.select().from(products).all(), before);
  const movements = db
    .select()
    .from(inventoryMovements)
    .where(eq(inventoryMovements.type, "ORDER_CANCELLED"))
    .all();
  assert.equal(movements.length, 2);
  assert.deepEqual(
    movements.map((m) => m.quantity),
    [2, 1],
  );
  assert.deepEqual(
    (await apiGet(`/api/orders/${order.id}`, orderDetailsSchema)).items,
    order.items,
  );
});
test("mutation client sends exact HTTP contracts and does not retry uncertain or failed writes", async (t) => {
  const fetch = routeFetch(t);
  await submitOrderAction(order.id, "PACKED");
  assert.equal(fetch.mock.calls[0].arguments[1]?.method, "PATCH");
  assert.equal(fetch.mock.calls[0].arguments[1]?.body, JSON.stringify({ status: "PACKED" }));
  await submitOrderAction(order.id, "CANCELLED");
  assert.equal(fetch.mock.calls[1].arguments[1]?.method, "POST");
  assert.equal(fetch.mock.calls[1].arguments[1]?.body, undefined);
  fetch.mock.restore();
  const failed = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("PRIVATE network details");
  });
  await assert.rejects(
    submitOrderAction(order.id, "PACKED"),
    (error: unknown) => error instanceof ApiClientError && error.outcomeUnknown,
  );
  assert.equal(failed.mock.callCount(), 1);
});
test("400, 404, 409, 500 and network errors produce safe, actionable messages", () => {
  for (const status of [400, 404, 409, 500]) {
    const message = orderActionError(
      new ApiClientError("PRIVATE SQL", status, "INVALID_TRANSITION"),
    );
    assert.ok(message.length > 20);
    assert.doesNotMatch(message, /PRIVATE SQL/);
  }
  assert.match(orderActionError(new ApiClientError("private", 409, "INVENTORY_CONFLICT")), /busy/);
  assert.match(
    orderActionError(new ApiClientError("private", undefined, undefined, true)),
    /couldn’t confirm/,
  );
});
