import { databasePath } from "./config";
import { createDatabase } from "./connection";

const db = createDatabase();

try {
  console.log(`Database: ${databasePath}`);
  console.log("Foreign keys enabled:", db.$client.pragma("foreign_keys", { simple: true }));
  console.table(db.$client.prepare(`
    SELECT name, type, tbl_name AS table_name
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'
    ORDER BY type DESC, name
  `).all());
  console.table(["products", "orders", "order_items", "inventory_movements"].map((table) => {
    const result = db.$client.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number };
    return { table, rows: result.count };
  }));
  console.log("Foreign key violations:", db.$client.pragma("foreign_key_check"));
} finally {
  db.$client.close();
}
