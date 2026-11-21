import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { databasePath } from "./config";
import * as schema from "./schema";

export function createDatabase(filename = databasePath) {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const client = new BetterSqlite3(filename);
  try {
    // Foreign key enforcement is per connection in SQLite.
    client.pragma("foreign_keys = ON");
    client.pragma("busy_timeout = 5000");
    client.pragma("journal_mode = WAL");
    return drizzle(client, { schema });
  } catch (error) {
    client.close();
    throw error;
  }
}
