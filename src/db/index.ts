import { createDatabase } from "./connection";

// Reuse the connection across Next.js development hot reloads.
const globalDatabase = globalThis as typeof globalThis & {
  commerceDatabase?: ReturnType<typeof createDatabase>;
};

export const db = globalDatabase.commerceDatabase ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalDatabase.commerceDatabase = db;
}
