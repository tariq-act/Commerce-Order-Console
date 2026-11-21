import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrationsPath } from "./config";
import { createDatabase } from "./connection";
import { db } from "./index";
import { products } from "./schema";

const expectedTables = ["inventory_movements", "order_items", "orders", "products"];

function assertSchema(connection: ReturnType<typeof createDatabase>) {
  assert.equal(connection.$client.pragma("foreign_keys", { simple: true }), 1);
  const tables = connection.$client.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'
    ORDER BY name
  `).all() as { name: string }[];
  assert.deepEqual(tables.map((table) => table.name), expectedTables);

  for (const table of ["order_items", "inventory_movements"]) {
    const keys = connection.$client.pragma(`foreign_key_list(${table})`) as {
      from: string; table: string; to: string; on_delete: string; on_update: string;
    }[];
    assert.equal(keys.length, 2);
    for (const [column, parent] of [["order_id", "orders"], ["product_id", "products"]]) {
      assert.ok(keys.some((key) => key.from === column && key.table === parent
        && key.to === "id" && key.on_delete === "RESTRICT" && key.on_update === "CASCADE"));
    }
  }
  assert.deepEqual(connection.$client.pragma("foreign_key_check"), []);
}

// Only read the application database. Constraint test rows live in memory.
const testDb = createDatabase(":memory:");
let constraintChecks = 0;

function rejectsConstraint(code: string | RegExp, action: () => unknown) {
  assert.throws(action, (error: unknown) => {
    if (!(error instanceof Error) || !("code" in error)) return false;
    return typeof code === "string" ? error.code === code : code.test(String(error.code));
  });
  constraintChecks += 1;
}

try {
  assertSchema(db);
  assert.equal(db.get<{ connected: number }>(sql`SELECT 1 AS connected`)?.connected, 1);
  db.select().from(products).limit(1).all();
  console.log("Application connection, four tables, foreign key definitions and integrity: PASS");

  migrate(testDb, { migrationsFolder: migrationsPath });
  migrate(testDb, { migrationsFolder: migrationsPath });
  assertSchema(testDb);
  const migrationCount = testDb.$client.prepare(
    "SELECT count(*) AS count FROM __drizzle_migrations",
  ).get() as { count: number };
  assert.equal(migrationCount.count, 1);
  console.log("Initial migration and repeat migration on an isolated database: PASS");

  const product = testDb.insert(products).values({
    name: "Constraint verification", sku: "VERIFY-1", priceCents: 1250, stock: 5,
    updatedAt: new Date(0),
  }).returning().get();
  assert.ok(product.createdAt instanceof Date);
  const secondProduct = testDb.insert(products).values({
    name: "Constraint verification", sku: "VERIFY-2", priceCents: 0, stock: 0,
  }).returning().get();
  testDb.update(products).set({ stock: 4 }).where(eq(products.id, product.id)).run();
  assert.ok(testDb.select().from(products).where(eq(products.id, product.id)).get()!.updatedAt.getTime() > 0);

  const client = testDb.$client;
  const insertOrder = client.prepare("INSERT INTO orders (reference, total_cents) VALUES (?, ?)");
  const orderId = Number(insertOrder.run("VERIFY-ORDER-1", 1250).lastInsertRowid);
  const secondOrderId = Number(insertOrder.run("VERIFY-ORDER-2", 0).lastInsertRowid);
  const insertItem = client.prepare(`
    INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)
  `);
  const insertMovement = client.prepare(`
    INSERT INTO inventory_movements (order_id, product_id, type, quantity) VALUES (?, ?, ?, ?)
  `);
  insertItem.run(orderId, product.id, 1, 1250);
  insertMovement.run(orderId, product.id, "ORDER_PLACED", 1);

  rejectsConstraint("SQLITE_CONSTRAINT_UNIQUE", () => client.prepare(
    "INSERT INTO products (name, sku, price_cents) VALUES ('duplicate', 'VERIFY-1', 100)",
  ).run());
  rejectsConstraint("SQLITE_CONSTRAINT_UNIQUE", () => insertOrder.run("VERIFY-ORDER-1", 1250));
  rejectsConstraint("SQLITE_CONSTRAINT_UNIQUE", () => insertItem.run(orderId, product.id, 1, 1250));
  rejectsConstraint("SQLITE_CONSTRAINT_UNIQUE", () => insertMovement.run(orderId, product.id, "ORDER_PLACED", 1));

  // Composite keys permit different orders, products, and movement types.
  insertItem.run(secondOrderId, product.id, 1, 1250);
  insertItem.run(orderId, secondProduct.id, 1, 0);
  insertMovement.run(secondOrderId, product.id, "ORDER_PLACED", 1);
  insertMovement.run(orderId, secondProduct.id, "ORDER_PLACED", 1);
  insertMovement.run(orderId, product.id, "ORDER_CANCELLED", 1);
  rejectsConstraint("SQLITE_CONSTRAINT_UNIQUE", () => insertMovement.run(orderId, product.id, "ORDER_CANCELLED", 1));

  for (const [order, productId] of [[999999, product.id], [orderId, 999999]]) {
    rejectsConstraint("SQLITE_CONSTRAINT_FOREIGNKEY", () => insertItem.run(order, productId, 1, 100));
    rejectsConstraint("SQLITE_CONSTRAINT_FOREIGNKEY", () => insertMovement.run(order, productId, "ORDER_PLACED", 1));
  }
  for (const [table, id] of [["products", product.id], ["orders", orderId]] as const) {
    rejectsConstraint(/^SQLITE_CONSTRAINT_(FOREIGNKEY|TRIGGER)$/, () => client.prepare(
      `DELETE FROM ${table} WHERE id = ?`,
    ).run(id));
  }

  for (const [table, column] of [
    ["products", "price_cents"], ["products", "stock"], ["orders", "total_cents"],
    ["order_items", "unit_price_cents"],
  ]) {
    for (const invalid of [-1, 1.5, "invalid", Number.MAX_SAFE_INTEGER + 1]) {
      rejectsConstraint("SQLITE_CONSTRAINT_CHECK", () => client.prepare(
        `UPDATE ${table} SET ${column} = ?`,
      ).run(invalid));
    }
  }
  for (const table of ["order_items", "inventory_movements"]) {
    for (const invalid of [0, -1, 1.5, "invalid", Number.MAX_SAFE_INTEGER + 1]) {
      rejectsConstraint("SQLITE_CONSTRAINT_CHECK", () => client.prepare(
        `UPDATE ${table} SET quantity = ?`,
      ).run(invalid));
    }
  }
  rejectsConstraint("SQLITE_CONSTRAINT_CHECK", () => client.prepare("UPDATE orders SET status = 'INVALID'").run());
  rejectsConstraint("SQLITE_CONSTRAINT_CHECK", () => client.prepare("UPDATE inventory_movements SET type = 'INVALID'").run());
  rejectsConstraint("SQLITE_CONSTRAINT_NOTNULL", () => client.prepare("UPDATE products SET stock = NULL").run());
  rejectsConstraint("SQLITE_CONSTRAINT_NOTNULL", () => client.prepare("UPDATE order_items SET quantity = NULL").run());

  for (const status of ["PLACED", "PACKED", "SHIPPED", "CANCELLED"]) {
    client.prepare("UPDATE orders SET status = ?").run(status);
  }
  assert.deepEqual(client.pragma("foreign_key_check"), []);
  assert.equal(client.pragma("integrity_check", { simple: true }), "ok");
  console.log(`${constraintChecks} invalid-write checks, valid composite key variants, enums, and timestamp mapping: PASS`);
  console.log("Application database unchanged; no seed data inserted.");
} finally {
  testDb.$client.close();
  db.$client.close();
}
