import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import { z } from "zod";

// Share Next.js .env/.env.local loading with the database command-line tools.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const environment = z.object({
  DATABASE_PATH: z.string().trim().min(1).default("./data/commerce.db"),
}).parse(process.env);

// The SQLite file is supplied at runtime, rather than bundled into the server.
export const databasePath = resolve(/* turbopackIgnore: true */ process.cwd(), environment.DATABASE_PATH);
export const migrationsPath = resolve(process.cwd(), "src/db/migrations");
