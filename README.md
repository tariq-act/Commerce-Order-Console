# Commerce Order Console backend setup

Steps 1 through 6 provide the SQLite schema, database infrastructure, repeatable product seeding, product REST APIs, transactional order creation, order listing/details, fulfilment, and cancellation for the Fynd Hiring Hackathon. The workspace was empty, so this project includes a minimal Next.js App Router configuration with strict TypeScript. Frontend components are deferred to later steps. The application can run and build with API routes only.

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

| Command                                     | Purpose                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run db:generate -- --name=description` | Generate a migration after changing the schema                                             |
| `npm run db:migrate`                        | Apply pending migrations using the configured connection                                   |
| `npm run db:seed`                           | Insert the six initial products, skipping SKUs that already exist                          |
| `npm run db:inspect`                        | List tables, indexes, row counts, and foreign key integrity                                |
| `npm run db:studio`                         | Open Drizzle Studio for database inspection                                                |
| `npm run db:verify`                         | Read-check the application database and test constraints in an isolated in-memory database |
| `npm run typecheck`                         | Run the strict TypeScript check                                                            |
| `npm test`                                  | Run product and order tests against migrated, seeded temporary SQLite databases            |
| `npm run format`                            | Format source, tests, configuration, and documentation with Prettier                       |
| `npm run format:check`                      | Check formatting without modifying files                                                   |

Prettier is pinned in the development dependencies. Formatting uses two-space indentation, double quotes, semicolons, trailing commas, and a 100-column target. Generated Next.js files, database files, migration artifacts, and the npm lockfile are excluded through `.prettierignore`. Editor integrations can use the project-local Prettier installation and `.prettierrc.json`.

Apply migrations explicitly before using the database. Application startup does not apply them automatically. Verification inserts temporary rows only in memory and closes that database afterward; it does not seed or modify application rows.

The seed uses `src/db/seed.ts` and the existing shared database connection. It adds Wireless Mouse, Mechanical Keyboard, USB-C Hub, Monitor Stand, Webcam HD, and Laptop Sleeve with SKUs `ACC-001` through `ACC-006`, descriptions, integer paise prices, and their initial stock levels. Webcam HD starts with zero stock. All missing products are inserted atomically in one statement. Repeated runs skip existing SKUs entirely, preserving current inventory, product details, and timestamps. Seeding creates no orders, order items, or inventory movements.

## Product REST APIs

Run `npm run dev` to serve the endpoints locally, or `npm run build` followed by `npm start` for a production build. Configure and migrate the writable SQLite database before starting the server; its file is supplied at runtime rather than bundled into the build.

| Endpoint                                           | Behavior                                                      |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `GET /api/products`                                | Return all products ordered by ID                             |
| `GET /api/products?search=mouse`                   | Case-insensitive literal substring search across name and SKU |
| `GET /api/products?stock=in_stock`                 | Return products with stock greater than zero                  |
| `GET /api/products?stock=out_of_stock`             | Return products with zero stock                               |
| `GET /api/products?search=acc-&stock=out_of_stock` | Combine search and stock conditions                           |
| `GET /api/products/1`                              | Return the product with the given positive safe integer ID    |

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

## Order creation API

`POST /api/orders` accepts JSON containing at least one item. Product IDs match the existing integer schema: use a positive safe integer or its decimal digit string. Quantities must be positive safe integer JSON numbers. Duplicate IDs are rejected after normalization, so `1`, `"1"`, and `"01"` identify the same product. Unknown body/item fields, including client-supplied prices, are rejected.

Example request using seeded product IDs:

```json
{
  "items": [
    { "productId": "1", "quantity": 2 },
    { "productId": "2", "quantity": 1 }
  ]
}
```

HTTP 201 returns the shared success envelope with `data.id`, a generated `data.reference` beginning with `ORD-`, `data.status` equal to `PLACED`, `data.items`, `data.totalCents`, and an ISO `data.createdAt`. Each response item contains `productId`, `productName`, `quantity`, and historical `unitPriceCents`. The example request totals 409700 paise using the initial product prices.

| HTTP status | Error code and meaning                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 400         | `VALIDATION_ERROR`: invalid JSON/body, duplicate IDs, invalid quantities/IDs, or a total outside the safe integer range          |
| 404         | `NOT_FOUND`: a requested product does not exist                                                                                  |
| 409         | `INSUFFICIENT_STOCK`: a requested quantity is unavailable                                                                        |
| 409         | `INVENTORY_CONFLICT`: a conditional deduction failed or the SQLite writer lock could not be acquired before the existing timeout |
| 500         | `INTERNAL_SERVER_ERROR`: unexpected failure, with details logged only on the server                                              |

`src/app/api/orders/route.ts` handles JSON input and shared HTTP responses. `src/services/order.service.ts` validates with `src/lib/validations/order.ts` and implements placement, so callers of the service receive the same input safeguards.

The service uses one synchronous Drizzle transaction with `behavior: "immediate"`, which acquires the SQLite writer lock before reading product availability ([SQLite transaction documentation](https://www.sqlite.org/lang_transaction.html)). It reuses the connection's WAL mode and five-second busy timeout. All product reads, price snapshots, stock checks, total calculations, order/item inserts, stock deductions, and `ORDER_PLACED` movement inserts run inside that transaction. Every item is checked before any rows or stock are changed. Deductions use `UPDATE ... WHERE stock >= quantity` and require exactly one affected row. Any thrown failure rolls back the entire transaction. Money multiplication and addition use `BigInt`; only totals within JavaScript's safe integer range are converted to the existing integer paise fields.

`tests/orders.test.ts` covers successful orders, exact totals, deductions and movements, input failures, missing products, shortages, full rollback after injected write failures, conditional-update conflicts, writer-lock timeouts, overflow, and price snapshot preservation. The concurrency test uses four separate processes through `tests/helpers/place-order-worker.ts`, each with its own SQLite connection, released against the same limited stock. All fixtures and test mutations use temporary databases; development seed data is preserved.

## Order listing and details APIs

`GET /api/orders` returns paginated order summaries with ID, reference, status, integer paise `totalCents`, and ISO `createdAt`. Orders are sorted by creation timestamp descending, then ID descending to keep equal-date results in a stable order.

| Parameter | Validation and behavior                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `search`  | Optional case-insensitive literal substring search on the reference; 1–200 characters after trimming     |
| `status`  | Optional exact value: `PLACED`, `PACKED`, `SHIPPED`, or `CANCELLED`                                      |
| `page`    | Positive safe integer in decimal digits; defaults to 1; the resulting offset must also be a safe integer |
| `limit`   | Integer from 1 through 100 in decimal digits; defaults to 20                                             |

Search and status conditions are combined with AND. For example, `/api/orders?search=ord-&status=PLACED&page=1&limit=20` returns the first page of matching placed orders. Pagination totals reflect the matching filters. Pages beyond the end return an empty array; an empty result has `totalPages: 0`. Unknown, repeated, empty, or malformed query parameters return HTTP 400.

Example list response when nothing matches:

```json
{
  "success": true,
  "data": {
    "orders": [],
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
  }
}
```

`GET /api/orders/[id]` requires a positive safe integer ID. Its success envelope contains `data.id`, `reference`, `status`, `totalCents`, `createdAt`, and `items`. Each item includes `id`, `productId`, `productName`, `sku`, `quantity`, historical `unitPriceCents`, and `subtotalCents`. Product names/SKUs come from the product record, while monetary values come from the stored order/item snapshots. Subtotals multiply historical unit prices by quantities using exact integer arithmetic. The order total is read from `orders.totalCents` and is never recalculated from current product prices.

Both endpoints return HTTP 200 on success, HTTP 400 for invalid parameters, and safe HTTP 500 JSON on unexpected failures. A missing order returns HTTP 404:

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Order not found." } }
```

Read queries live in `src/services/order-query.service.ts`, separate from the existing order creation logic. Each response uses a read transaction so its count/page or header/items share one SQLite snapshot. Filtering and joins use bound Drizzle queries ([Drizzle query documentation](https://orm.drizzle.team/docs/select)); wildcard search characters are treated literally. Both routes use the Node.js runtime and return `Cache-Control: no-store`.

`tests/order-queries.test.ts` uses a migrated, seeded temporary database and the existing order creation service. It covers all statuses, combined search/filtering, sort order, pagination/defaults/limits, complete details, historical prices, invalid inputs, nonexistent IDs, injection strings, safe failures, and unchanged rows after reads. Status changes in these fixtures do not implement status-transition APIs.

## Fulfilment and cancellation APIs

Use an existing order ID from order creation or `GET /api/orders`.

`PATCH /api/orders/[id]/status` accepts a strict JSON body:

```json
{ "status": "PACKED" }
```

Only `PLACED` to `PACKED` and `PACKED` to `SHIPPED` are allowed. Every other transition is rejected, including no-op requests, backwards transitions, and using this endpoint to set `CANCELLED`. Fulfilment never changes stock or inventory movements.

`POST /api/orders/[id]/cancel` requires no body. It allows `PLACED` or `PACKED` to transition to `CANCELLED`. Requests for `SHIPPED` or already `CANCELLED` orders are rejected. Each item restores its quantity to current product stock and creates one `ORDER_CANCELLED` movement, while preserving the original `ORDER_PLACED` movements.

Both endpoints return HTTP 200 with the shared success envelope. `data` contains `id`, `reference`, `status`, `totalCents`, and ISO `createdAt`/`updatedAt`. Item records, historical unit prices, order totals, references, and creation dates remain unchanged.

| HTTP status | Meaning                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| 400         | `VALIDATION_ERROR`: invalid ID, malformed JSON, unknown status, or invalid status body                                      |
| 404         | `NOT_FOUND`: the order does not exist                                                                                       |
| 409         | `INVALID_TRANSITION`: the requested transition is disallowed or a conditional status update failed                          |
| 409         | `INVENTORY_CONFLICT`: writer-lock timeout, duplicate restoration movement, or a restoration that cannot safely update stock |
| 500         | `INTERNAL_SERVER_ERROR`: unexpected failure with details logged only on the server                                          |

`updateOrderStatus` and `cancelOrder` extend the existing `src/services/order.service.ts`; order creation logic is preserved. Both validate inputs in the service and use the existing connection with one synchronous immediate transaction per operation. They fetch the order after obtaining the writer lock and conditionally update only its expected current status. Cancellation then restores every item's stock and inserts its cancellation movement before committing. Restoration also guards the existing maximum safe integer stock limit.

Repeated or competing cancellation requests cannot restore stock twice: the status check rejects completed cancellation, the conditional update checks the expected status, and the existing unique order/product/movement-type index rejects duplicate records. Duplicate inserts are never silently ignored; they throw so the status change, all stock restorations, and all new movements roll back together. Any other failure has the same all-or-nothing behavior. Existing WAL mode and the five-second busy timeout are reused.

`tests/order-transitions.test.ts` covers the full status-transition matrix, cancellation from both eligible states, forbidden/repeated requests, multi-item restoration, original history, invalid/nonexistent IDs, malformed payloads, stock overflow, unique constraints, writer-lock timeout, conditional-update failures, and failures after earlier items have been restored. `tests/helpers/order-transition-worker.ts` runs separate SQLite connections for simultaneous cancellations, duplicate fulfilment, and shipping versus cancellation. Every test uses a temporary database.

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

Order placement calculates totals, deducts stock, and writes inventory movements through its transaction. Fulfilment changes only allowed statuses. Cancellation restores item quantities and records inventory movements in one transaction without modifying historical prices or totals.
