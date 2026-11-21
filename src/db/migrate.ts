import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { databasePath, migrationsPath } from "./config";
import { createDatabase } from "./connection";

const db = createDatabase();

try {
  migrate(db, { migrationsFolder: migrationsPath });
  console.log(`Migrations applied successfully: ${databasePath}`);
} finally {
  db.$client.close();
}
