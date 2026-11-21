import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { apiGet, ApiClientError } from "../src/lib/api-client";
import { formatCurrency, formatDate } from "../src/lib/format";

const schema = z.object({ value: z.number().int() });
test("API client unwraps and validates success envelopes and forwards cancellation", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (_path: string, init: RequestInit) => {
    assert.equal(init.signal, controller.signal);
    assert.equal(init.cache, "no-store");
    return Response.json({ success: true, data: { value: 12 } });
  });
  assert.deepEqual(await apiGet("/api/example", schema, controller.signal), { value: 12 });
});
test("API client handles HTTP failures without revealing response internals", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("secret database path", { status: 500 }),
  );
  await assert.rejects(
    apiGet("/api/example", schema),
    (error) =>
      error instanceof ApiClientError && error.status === 500 && !error.message.includes("secret"),
  );
});
test("API client rejects malformed success data", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ success: true, data: { value: "wrong" } }),
  );
  await assert.rejects(apiGet("/api/example", schema), /unexpected response/);
});
test("API client rejects non-JSON success and network failures", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("<html>proxy</html>"));
  await assert.rejects(apiGet("/api/example", schema), /unreadable response/);
  fetch.mock.mockImplementation(async () => {
    throw new TypeError("Network unavailable");
  });
  await assert.rejects(apiGet("/api/example", schema), /Network unavailable/);
});
test("INR formatter retains paise, Indian grouping, and safe integer boundaries", () => {
  assert.equal(formatCurrency(79900), "₹799.00");
  assert.equal(formatCurrency(123456789), "₹12,34,567.89");
  assert.equal(formatCurrency(0), "₹0.00");
  assert.equal(formatCurrency(Number.MAX_SAFE_INTEGER), "₹9,00,71,99,25,47,409.91");
  assert.throws(() => formatCurrency(1.5));
});
test("dates consistently use Indian Standard Time", () => {
  assert.equal(formatDate("2026-11-20T20:00:00Z"), "21 Nov 2026");
});
