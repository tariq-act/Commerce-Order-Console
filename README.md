# Commerce Order Console backend setup

Steps 1 through 3 provide the SQLite schema, database infrastructure, repeatable product seeding, and read-only product REST APIs for the Fynd Hiring Hackathon. The workspace was empty, so this project includes a minimal Next.js App Router configuration with strict TypeScript. Order APIs, frontend components, and business operations are deferred to later steps. The application can run and build with API routes only.

## Setup and commands

Use Node.js 22 or later. Run commands from the project root:

```sh
npm ci
npm run db:migrate
npm run db:seed
npm run db:verify
npm run typecheck
npm test
```

The database defaults to `./data/commerce.db`. To change it, copy `.env.example` to `.env.local` and set `DATABASE_PATH` to a local file path. Relative paths resolve from the project root. Environment files follow Next.js loading rules; the same configuration is used by application code, migrations, and Drizzle Studio. Database files and local environment files are ignored by Git. The migration SQL and its metadata must be committed.

| Command | Purpose |
| --- | --- |
| `npm run db:generate -- --name=description` | Generate a migration after changing the schema |
| `npm run db:migrate` | Apply pending migrations using the configured connection |
| `npm run db:seed` | Insert the six initial products, skipping SKUs that already exist |
| `npm run db:inspect` | List tables, indexes, row counts, and foreign key integrity |
| `npm run db:studio` | Open Drizzle Studio for database inspection |
| `npm run db:verify` | Read-check the application database and test constraints in an isolated in-memory database |
| `npm run typecheck` | Run the strict TypeScript check |
| `npm test` | Run product endpoint tests against a migrated, seeded temporary SQLite database |

Apply migrations explicitly before using the database. Application startup does not apply them automatically. Verification inserts temporary rows only in memory and closes that database afterward; it does not seed or modify application rows.

The seed uses `src/db/seed.ts` and the existing shared database connection. It adds Wireless Mouse, Mechanical Keyboard, USB-C Hub, Monitor Stand, Webcam HD, and Laptop Sleeve with SKUs `ACC-001` through `ACC-006`, descriptions, integer paise prices, and their initial stock levels. Webcam HD starts with zero stock. All missing products are inserted atomically in one statement. Repeated runs skip existing SKUs entirely, preserving current inventory, product details, and timestamps. Seeding creates no orders, order items, or inventory movements.

## Product REST APIs

Run `npm run dev` to serve the endpoints locally, or `npm run build` followed by `npm start` for a production build. Configure and migrate the writable SQLite database before starting the server; its file is supplied at runtime rather than bundled into the build.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/products` | Return all products ordered by ID |
| `GET /api/products?search=mouse` | Case-insensitive literal substring search across name and SKU |
| `GET /api/products?stock=in_stock` | Return products with stock greater than zero |
| `GET /api/products?stock=out_of_stock` | Return products with zero stock |
| `GET /api/products?search=acc-&stock=out_of_stock` | Combine search and stock conditions |
| `GET /api/products/1` | Return the product with the given positive safe integer ID |

`search` is optional and must contain 1–200 characters after trimming. `stock` is optional and accepts exactly `in_stock` or `out_of_stock`. Empty values, repeated parameters, unknown parameters, and invalid IDs return HTTP 400. A missing product returns HTTP 404; an empty search result returns HTTP 200 with an empty array. Product dates are ISO strings and `priceCents` contains integer paise. Both endpoints use the Node.js runtime and return `Cache-Control: no-store` so stock reads stay current.

Successful responses use `{ "success": true, "data": ... }`, where `data` is a product array for the list endpoint and a product object for the detail endpoint. For example, a search with no matches returns:

```json
{ "success": true, "data": [] }
```

A nonexistent product returns HTTP 404:

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Product not found." } }
```

Validation errors use the same error envelope with code `VALIDATION_ERROR` and field/message details. Unexpected failures are logged on the server and return HTTP 500 with code `INTERNAL_SERVER_ERROR` and message `An unexpected error occurred.` Database details and stack traces are never included in that response.

Queries live in `src/services/product.service.ts`, Zod validation in `src/lib/validations/product.ts`, and shared JSON response types/helpers in `src/lib/api-response.ts`. The route handlers are under `src/app/api/products/`. Tests in `tests/products.test.ts` cover seeded results, filters, search, valid and invalid IDs, invalid queries, safe failures, and live stock changes using the real schema, migrations, and seed script. Test data is isolated from the application database and removed afterward.

## Database modules

- `src/db/index.ts` exports the reusable `db` connection, cached across development hot reloads.
- `src/db/connection.ts` creates connections with foreign keys enabled, WAL mode, and a five-second busy timeout.
- `src/db/config.ts` loads and validates database environment configuration with Zod.
- `src/db/schema/` contains the four table definitions and a shared export module.
- `src/db/types.ts` exports inferred read and insert types for every table, database types, and status/type unions.
- `src/db/migrations/` contains the generated initial SQL migration and Drizzle metadata.
- `src/db/migrate.ts`, `inspect.ts`, and `verify.ts` provide the database commands.
- `drizzle.config.ts` configures schema discovery, migration output, and Studio access.

Import `db` from `@/db` only in server code running in the Node.js runtime. The native `better-sqlite3` driver requires a writable local filesystem. External SQLite tools must enable `PRAGMA foreign_keys = ON` on their own connections.

## Schema guarantees

All IDs are automatically incremented integer primary keys. TypeScript field names use camelCase and SQL columns use snake_case. SKU and order reference values are unique. Order items have a unique order/product pair, and inventory movements have a unique order/product/type combination. All foreign keys are required, restrict parent deletion, and cascade parent ID updates. Their lookup columns are covered by indexes; orders also have status/date and date indexes.

Money is stored in integer cents. Database checks require non-negative integer money and stock, and positive integer item and movement quantities. These values are bounded by JavaScript's maximum safe integer. SQLite checks also reject fractional values and nonnumeric text, even for direct SQL writes. Order statuses and movement types are constrained in both TypeScript and SQLite.

Timestamps are stored as Unix milliseconds and mapped to JavaScript `Date` values. Database creation defaults have one-second precision. Drizzle refreshes `updatedAt` on ORM updates unless a value is explicitly supplied; direct SQL writers must set `updatedAt` themselves.

The schema does not yet calculate order totals, change stock, enforce status transitions, or write inventory movements. Those operations belong to later transactional business logic.
