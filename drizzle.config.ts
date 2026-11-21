import { defineConfig } from "drizzle-kit";
import { databasePath } from "./src/db/config";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: databasePath },
  strict: true,
});
