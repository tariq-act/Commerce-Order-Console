# Fynd Commerce Order Console

Fynd Hiring Hackathon Commerce Order Console with a complete backend and a responsive frontend foundation. It provides a product catalogue, atomic order placement, order search and details, fulfilment, cancellation with exactly-once stock restoration, and inventory movement history. The dashboard displays live order metrics, recent orders, and low-stock products from SQLite. The product catalogue supports live browsing, search, stock filters, and read-only product details. The create-order workflow supports a stock-aware multi-product cart and server-confirmed checkout. Order management supports a live searchable, filtered, paginated list. Order details and inventory feature pages remain placeholders for subsequent integration steps.

## Technology stack

| Technology                  | Role                                                       |
| --------------------------- | ---------------------------------------------------------- |
| Next.js App Router          | Node.js Route Handlers under `/api`                        |
| TypeScript                  | Strict application, database, and test types               |
| SQLite and better-sqlite3   | Persistent local database and synchronous transactions     |
| Drizzle ORM and Drizzle Kit | Typed queries, constraints, migrations, and inspection     |
| Zod                         | Server-side request, query, ID, and environment validation |
| Node.js test runner and tsx | Isolated tests and production HTTP integration tests       |
| Prettier                    | Consistent formatting                                      |

The frontend uses TanStack Query for server state, Sonner for error notifications, React, Tailwind CSS 4, Radix UI primitives, Lucide icons, and shadcn/ui-style components configured in `components.json`. Class composition uses clsx, tailwind-merge, and class-variance-authority. Runtime versions and the exact dependency tree are recorded in `package.json` and `package-lock.json`.

## Installation

Requirements: Node.js 22 or later, npm, and a writable local filesystem. Run commands from the project root.

```sh
npm ci
cp .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

The local API base URL is `http://localhost:3000/api`. Open `http://localhost:3000` for the console; the root redirects to `/dashboard`. Check the seed with:

```sh
curl http://localhost:3000/api/products
curl http://localhost:3000/api/inventory
```

For production:

```sh
npm run build
npm start
```

Apply migrations before starting the server. Startup does not migrate or seed automatically. Database setup/testing tools are development dependencies, so run setup while those tools are installed. The SQLite file is supplied at runtime and is not bundled into the build. Deployment requires Node.js, native `better-sqlite3` support, and persistent writable storage for the database and its WAL sidecars; the Edge runtime is not supported.

## Frontend foundation

| Route          | Current interface                                                         |
| -------------- | ------------------------------------------------------------------------- |
| `/dashboard`   | Live KPI cards, five recent orders, low-stock products, and quick actions |
| `/products`    | Live catalogue, debounced search, stock filters, and product details      |
| `/orders`      | Live order list with reference/status filters and pagination              |
| `/orders/new`  | Product selection, cart, validated checkout, and confirmation             |
| `/orders/[id]` | Order details placeholder (no data lookup or ID validation yet)           |
| `/inventory`   | Inventory placeholder                                                     |

The shared layout provides a collapsible desktop sidebar, breadcrumbs, profile and notification menus, a workspace guide, and a mobile navigation dialog below 1024px. Sidebar collapse preference is stored locally in the browser. The profile represents the local workspace; authentication and notification delivery are not implemented.

Design tokens live in `src/app/globals.css`. Reusable components include Button, Input, Select, Card, Badge, Table, Dialog, DropdownMenu, Skeleton, EmptyState, PageHeader, and OrderStatusBadge. Dialogs, menus, and selects use Radix keyboard/focus handling. The shell includes semantic landmarks, a skip link, labelled icon controls, responsive grids, and reduced-motion support. System fonts keep builds independent of external font services.

Use `npm run dev` and open the localhost URL printed by Next.js. Production builds use Next.js's supported Webpack compiler because the restricted local environment prevents Turbopack's CSS worker from binding its internal port. This does not change API contracts. Verify the layout at desktop, tablet, and mobile widths, open the mobile navigation and menus, and check the placeholder links. The dashboard is read-only. The product catalogue and dashboard are read-only. Order creation is implemented; order details and inventory feature pages remain placeholders.

## Product catalogue

Open `/products` to browse the current SQLite catalogue. The table shows product name, SKU, description, INR price, stock quantity, availability, and a View action. Product information is fetched through the existing shared API client and validated against the actual product JSON contract before entering TanStack Query's cache. The details dialog fetches `/api/products/[id]` independently so it includes current inventory, full description, creation and update dates. No product creation, editing, deletion, or stock mutation is implemented.

The search field debounces by 300 ms and searches both name and SKU through `GET /api/products`. Stock choices map to the API's `stock=in_stock` and `stock=out_of_stock`; All products omits that parameter. Search and stock filters combine. State is shareable through `/products?search=mouse&stock=in_stock`; `product=<id>` opens a product details deep link. Filter changes preserve pending searches, and selection changes preserve filters. Search edits replace the current history entry; stock selections and opening a product add entries. Closing details removes selection while preserving filters. Browser Back/Forward and reload use the URL state.

Loading skeletons cover list and detail requests; dedicated states handle empty catalogues, no matching results, malformed URL filters/IDs, missing products, and API failures. Failures hide outdated records and offer retry controls where retrying can help. List errors also use Sonner notifications. Dialogs trap focus, support Escape, and return focus to the View button or search field. The table scrolls within its card on narrow screens; other controls and the dialog adapt to the viewport. Currency and dates reuse the shared INR/IST formatters. All data comes from the existing product endpoints; no backend API, business rule, or database schema changes are needed.

Implementation lives in `src/features/products/`: reusable table/search/filter/details/status components, query and URL state hooks, URL parsing helpers, and Zod response types. No new dependencies were added for this step.

## Create order workflow

Open `/orders/new`. The product selector reuses `GET /api/products` with a 300 ms debounced name/SKU search. Stock badges, available quantities and Add controls come from API data. Repeated additions merge into one cart entry. Quantity controls stop at one and at the available stock, with explicit removal available. Stock drops preserve selected quantities and mark conflicts; an explicit decrease recovers to the new positive limit. Out-of-stock or missing products cannot be submitted.

The cart previews line subtotals, total units, subtotal and estimated total with integer paise arithmetic. Price/quantity overflow disables checkout. The search is outside the checkout form, so Enter in search cannot place an order. Mobile layouts provide a Cart jump link; desktop layouts show selection and cart side by side.

Only `{ items: [{ productId, quantity }] }` is sent to `POST /api/orders`. Client prices and stock are never submitted. The existing backend transaction calculates final prices, validates inventory and writes the order. A validated successful response displays the actual order reference, stored item prices, confirmed total, and a link to `/orders/[id]`. Success shows a Sonner notification, clears the cart, and invalidates products, orders, inventory and dashboard queries. Order details still use the existing placeholder route until the corresponding UI step.

Cart controls and checkout lock during submission, with an additional synchronous guard against repeated clicks. Writes have no automatic retries or offline queue, and a 20-second timeout. HTTP 400/404/409/500 and network failures preserve the cart on the current page. Stock conflicts refresh product queries so unavailable entries can be adjusted or removed. A lost or unreadable response is treated as an uncertain outcome, with guidance to check orders before manually retrying. The existing API has no idempotency-key contract; the UI does not claim exactly-once creation across network failures. Cart state is in memory; navigation or reload starts a fresh cart.

Implementation lives in `src/features/orders/`: product selector, cart/items/summary, confirmation, create-order form, cart arithmetic, mutation/cart hooks, and the actual response contract. `apiPost` extends the shared client without changing GET behavior. Separator reuses the installed Radix package. No new dependencies or backend business logic changes were needed.

## Order management

Open `/orders` for the read-only order management table. It uses the existing `GET /api/orders` envelope: `{ orders, pagination: { page, limit, total, totalPages } }` inside `data`. Defaults remain page 1 and 20 rows, with validated limits from 1 through 100. Order rows retain the API's newest-first ordering and stored `totalCents`; displayed totals never use current product prices.

Search by reference debounces for 300 ms. Status choices are All, PLACED, PACKED, SHIPPED and CANCELLED. Search, status, page and page size are stored in the URL; for example, `/orders?search=ORD&status=PACKED&page=2&limit=5`. Search/status/page-size edits reset to page one. Previous/next preserve active filters, clearing search preserves status, and browser Back/Forward or reload restore URL state. Invalid or repeated parameters show a resettable validation state instead of an unfiltered table. A page beyond the available results has an explicit return-to-first-page action.

The existing list endpoint does not return item counts. The UI queries `/api/orders/[id]` only for visible rows and sums historical item quantities into total units using safe integer arithmetic. Details are cached under `['orders', 'detail', id]`; page/filter changes cancel unused reads. Each count has its own loading/error/retry state; failed reads display Unavailable rather than zero. Refresh updates both active list and detail queries. At the default page size this uses one list request plus up to 20 detail requests, with cache reuse on return visits. No backend API/contract was changed to add counts.

The table shares the existing status badges, INR formatter, IST dates and design-system components. Loading skeletons, no-match and genuinely empty states, full-list retry, per-row count retry, and contained horizontal table scrolling support desktop and mobile use. Create Order opens `/orders/new`; reference and View links open `/orders/[id]`, which remains the existing placeholder until the details UI step.

Order response types reuse the backend's `OrderSummary`, `OrderPage` and `OrderDetails` types with JSON timestamp conversion. Runtime Zod schemas check the observed response contracts. The existing TanStack Query provider and API client are reused, with no new dependencies or backend business logic changes.

## Environment configuration

| Variable                        | Default              | Meaning                                                          |
| ------------------------------- | -------------------- | ---------------------------------------------------------------- |
| `DATABASE_PATH`                 | `./data/commerce.db` | SQLite filesystem path, relative to the project root or absolute |
| `DASHBOARD_LOW_STOCK_THRESHOLD` | `5`                  | Non-negative integer stock warning threshold (inclusive)         |

Copy `.env.example` to `.env.local` or set the variable in the process environment. Database commands share Next.js environment loading through `@next/env`. An empty path fails Zod validation. Use a filesystem path, not a connection URL or `file:` URI.

For deployment, use an absolute path on a persistent volume, for example `/var/lib/commerce/commerce.db`. Keep it server-side; never use a `NEXT_PUBLIC_` prefix. Next.js selects the environment through its `dev`, `build`, and `start` commands. Local environment files, databases, dependencies, and build output are ignored by Git. Commit `.env.example`, the lockfile, migration SQL, and migration metadata.

## Architecture

```text
src/
  app/(dashboard)/             # Shared dashboard shell and placeholder routes
  components/
    layout/                    # Sidebar, header, mobile navigation, workspace dialogs
    ui/                        # Reusable shadcn/ui-style Radix and HTML primitives
    shared/                    # Page headers, empty states, status badges, placeholders
  hooks/use-sidebar.ts         # Sidebar persistence and mobile navigation state
  app/api/
    products/                  # Product list and details
    orders/                    # Creation, listing, details, fulfilment, cancellation
    inventory/                 # Current inventory and movement history
  features/dashboard/          # Dashboard components, query hook, and validated API contract
  services/
    dashboard.service.ts       # Read-only snapshot aggregation across all orders
    product.service.ts         # Product queries reused by inventory
    order.service.ts           # Atomic creation, fulfilment, and cancellation rules
    order-query.service.ts     # Order queries and historical details
    inventory.service.ts       # Inventory records and stored movement queries
  lib/
    api-response.ts            # Shared JSON envelopes and error types
    validations/               # Zod schemas and shared query/pagination parsing
  db/
    index.ts                   # Shared application connection
    connection.ts, config.ts   # Connection factory, SQLite pragmas, environment
    types.ts                   # Inferred database types and status unions
    schema/                    # Four table definitions
    migrations/                # Generated SQL, journal, and snapshots
    migrate.ts, seed.ts         # Database setup commands
    inspect.ts, verify.ts       # Inspection and constraint verification
tests/
  *.test.ts                    # Route, service, contract, and concurrency tests
  helpers/                     # Separate-process contention workers
  integration/backend.test.ts # Production HTTP workflows and restart persistence
```

Handlers handle HTTP transport and shared responses. Services own queries and business rules; order mutation services validate inputs themselves. The connection is cached across development hot reloads. Connections enable foreign keys and a five-second busy timeout; file-backed databases use WAL mode.

Mutations use synchronous Drizzle transactions with `behavior: "immediate"`. All related reads and writes run inside one transaction. Conditional stock/status updates must affect exactly one row. Multi-query order/history reads share a read snapshot. Drizzle binds query values; search wildcard characters are treated literally. Inventory list/detail queries reuse product services.

## Database schema

TypeScript properties use camelCase; SQL columns use snake_case. IDs are automatically incremented integer primary keys. Required foreign keys use `ON DELETE RESTRICT` and `ON UPDATE CASCADE` to preserve related history.

### Products

| Field         | SQL column    | Type and constraint                              |
| ------------- | ------------- | ------------------------------------------------ |
| `id`          | `id`          | Integer primary key                              |
| `name`        | `name`        | Required text                                    |
| `sku`         | `sku`         | Required unique text                             |
| `description` | `description` | Required text, default empty string              |
| `priceCents`  | `price_cents` | Required non-negative safe integer paise         |
| `stock`       | `stock`       | Required non-negative safe integer, default 0    |
| `createdAt`   | `created_at`  | Required Unix milliseconds with creation default |
| `updatedAt`   | `updated_at`  | Required Unix milliseconds with creation default |

### Orders

| Field        | SQL column    | Type and constraint                                             |
| ------------ | ------------- | --------------------------------------------------------------- |
| `id`         | `id`          | Integer primary key                                             |
| `reference`  | `reference`   | Required unique text; generated as `ORD-` plus a UUID           |
| `status`     | `status`      | `PLACED`, `PACKED`, `SHIPPED`, or `CANCELLED`; default `PLACED` |
| `totalCents` | `total_cents` | Required non-negative safe integer paise                        |
| `createdAt`  | `created_at`  | Required Unix milliseconds with creation default                |
| `updatedAt`  | `updated_at`  | Required Unix milliseconds with creation default                |

Indexes cover reference uniqueness, creation date, and status plus creation date.

### Order items

| Field            | SQL column         | Type and constraint                               |
| ---------------- | ------------------ | ------------------------------------------------- |
| `id`             | `id`               | Integer primary key                               |
| `orderId`        | `order_id`         | Required foreign key to `orders.id`               |
| `productId`      | `product_id`       | Required foreign key to `products.id`             |
| `quantity`       | `quantity`         | Required positive safe integer                    |
| `unitPriceCents` | `unit_price_cents` | Required non-negative safe integer price snapshot |
| `createdAt`      | `created_at`       | Required Unix milliseconds with creation default  |

The order/product pair is unique. A product index and the composite unique index cover foreign-key lookups.

### Inventory movements

| Field       | SQL column   | Type and constraint                              |
| ----------- | ------------ | ------------------------------------------------ |
| `id`        | `id`         | Integer primary key                              |
| `productId` | `product_id` | Required foreign key to `products.id`            |
| `orderId`   | `order_id`   | Required foreign key to `orders.id`              |
| `type`      | `type`       | `ORDER_PLACED` or `ORDER_CANCELLED`              |
| `quantity`  | `quantity`   | Required positive safe integer                   |
| `createdAt` | `created_at` | Required Unix milliseconds with creation default |

The order/product/type combination is unique. Indexes cover product/date history and order/product/type lookups.

CHECK constraints reject fractional values, nonnumeric text, negative money/stock, non-positive quantities, unsafe numeric ranges, and invalid status/type values. The numeric ceiling is `Number.MAX_SAFE_INTEGER` (9007199254740991). Money is integer INR paise despite the existing `Cents` names: 799 INR is `79900`. `BigInt` intermediates protect money multiplication/addition from overflow before conversion to supported numeric fields.

Dates are mapped to JavaScript `Date` values and serialized as UTC ISO strings. Database creation defaults have one-second precision. Drizzle refreshes `updatedAt` on ORM updates unless explicitly supplied; direct SQL writers must set it themselves. External SQLite tools must enable `PRAGMA foreign_keys = ON` on their own connections.

## Migrations and seeding

```sh
npm run db:migrate
npm run db:seed
npm run db:inspect
npm run db:verify
```

The initial migration is `src/db/migrations/0000_initial_schema.sql`. `drizzle.config.ts` discovers `src/db/schema/index.ts` and writes migrations and metadata to `src/db/migrations/`. The migrator tracks applied migrations so reruns apply only pending changes. Commit SQL, journal, and snapshots together. To change a schema, update its definition and create a new migration rather than editing an already-applied file:

```sh
npm run db:generate -- --name=describe_change
npm run db:migrate
```

Seeding inserts these products with descriptions in one atomic statement:

| Product             | SKU     | Price in paise | Initial stock |
| ------------------- | ------- | -------------- | ------------- |
| Wireless Mouse      | ACC-001 | 79900          | 25            |
| Mechanical Keyboard | ACC-002 | 249900         | 10            |
| USB-C Hub           | ACC-003 | 149900         | 15            |
| Monitor Stand       | ACC-004 | 119900         | 8             |
| Webcam HD           | ACC-005 | 199900         | 0             |
| Laptop Sleeve       | ACC-006 | 59900          | 30            |

Existing SKUs are skipped entirely. Repeated seeds preserve inventory, prices, descriptions, IDs, and timestamps; no orders or movements are created. A partial seed receives only missing products. Current stock comes from `products`, not a reconstruction of movement history: initial seed inventory has no movement records.

## Development commands

| Command                                     | Purpose                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                               | Start development API server, normally on port 3000                    |
| `npm run build`                             | Build production application and validate route types                  |
| `npm start`                                 | Serve the production build                                             |
| `npm run typecheck`                         | Strict TypeScript check without emission                               |
| `npm run format`                            | Format source, tests, configuration, and documentation                 |
| `npm run format:check`                      | Check formatting without changing files                                |
| `npm test`                                  | Run route/service/contract tests and separate-process contention tests |
| `npm run test:integration`                  | Build and run production HTTP tests on a temporary database            |
| `npm run db:generate -- --name=description` | Generate a migration                                                   |
| `npm run db:migrate`                        | Apply pending migrations                                               |
| `npm run db:seed`                           | Insert missing seed products                                           |
| `npm run db:inspect`                        | Display tables, indexes, counts, and foreign-key integrity             |
| `npm run db:studio`                         | Open Drizzle Studio for inspection                                     |
| `npm run db:verify`                         | Verify configured database and exercise constraints in memory          |

Prettier is pinned and configured in `.prettierrc.json`. Generated Next.js files, migrations, databases, and the lockfile are excluded through `.prettierignore`. For a different development port, use `npm run dev -- --port 3001`.

## API conventions

All eleven implemented methods use `src/lib/api-response.ts`. Success responses have only `success` and `data`:

```json
{ "success": true, "data": [] }
```

`data` is the documented object or array. Empty lists are successful HTTP 200 responses. Application errors use:

```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Order not found." }
}
```

Validation errors may include `error.details`: an array of `{ "field": "items.0.quantity", "message": "..." }`. Use HTTP status and `error.code` for frontend behavior; exact validation wording may vary. Unexpected failures are logged only on the server and return:

```json
{
  "success": false,
  "error": { "code": "INTERNAL_SERVER_ERROR", "message": "An unexpected error occurred." }
}
```

| HTTP status | Error code              | Meaning                                                                                            |
| ----------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| 200         | None                    | Successful read or status/cancellation update                                                      |
| 201         | None                    | Order created                                                                                      |
| 400         | `VALIDATION_ERROR`      | Invalid ID/body/JSON/query, duplicate item, or unsupported total range                             |
| 404         | `NOT_FOUND`             | Requested product/order does not exist                                                             |
| 409         | `INSUFFICIENT_STOCK`    | An order item is unavailable                                                                       |
| 409         | `INVALID_TRANSITION`    | Disallowed/repeated status change or conditional status failure                                    |
| 409         | `INVENTORY_CONFLICT`    | Lock timeout, conditional inventory failure, restoration overflow, or duplicate restoration record |
| 500         | `INTERNAL_SERVER_ERROR` | Unexpected failure without database details or stack traces                                        |

Implemented handlers return `Content-Type: application/json` and `Cache-Control: no-store`. Framework-generated handling of unsupported methods, HEAD/OPTIONS, and unmatched URLs is outside these envelopes. Use JSON bodies where specified; GET bodies are not used.

IDs are positive safe integers; path IDs contain only decimal digits. Leading zeroes are normalized. Order creation accepts product IDs as numbers or digit strings, with duplicates rejected after normalization. Quantities must be positive safe integer JSON numbers. Money fields are integer paise, not decimal rupees; timestamps are ISO strings.

Frontend clients can use relative same-origin URLs such as `/api/products`. No custom cross-origin policy or authentication layer is configured. Examples below are illustrative: use the IDs and generated references from your database. Seeding creates products only; create an order before testing order list/details/fulfilment examples. An empty order list before placement is expected.

### Shared response records

| Record            | Exact fields                                                                        |
| ----------------- | ----------------------------------------------------------------------------------- |
| `Product`         | `id`, `name`, `sku`, `description`, `priceCents`, `stock`, `createdAt`, `updatedAt` |
| `OrderSummary`    | `id`, `reference`, `status`, `totalCents`, `createdAt`                              |
| `OrderRecord`     | All `OrderSummary` fields plus `updatedAt`; no `items`                              |
| `CreatedItem`     | `productId`, `productName`, `quantity`, `unitPriceCents`                            |
| `DetailItem`      | All `CreatedItem` fields plus `id`, `sku`, `subtotalCents`                          |
| `InventoryRecord` | `id`, `name`, `sku`, `priceCents`, `stock`, `availability`                          |
| `Movement`        | `id`, `productId`, `orderId`, `orderReference`, `type`, `quantity`, `createdAt`     |
| `Pagination`      | `page`, `limit`, `total`, `totalPages`                                              |

Names, references, descriptions, and SKUs are strings; IDs and money/quantity/count fields are numbers. `status` is `PLACED`, `PACKED`, `SHIPPED`, or `CANCELLED`. `availability` is `in_stock` or `out_of_stock`. Movement type is `ORDER_PLACED` or `ORDER_CANCELLED`; its quantity stays positive and type identifies deduction versus restoration.

### GET /api/dashboard

No query parameters or request body. Returns HTTP 200 with the shared `{ success: true, data }` envelope:

```json
{
  "success": true,
  "data": {
    "metrics": { "totalOrders": 0, "pendingOrders": 0, "shippedOrders": 0, "totalRevenueCents": 0 },
    "recentOrders": [],
    "lowStockProducts": [],
    "lowStockThreshold": 5,
    "generatedAt": "2026-11-21T10:00:00.000Z"
  }
}
```

This example represents an empty database. Metrics cover **all** orders, independent of pagination. Pending means `PLACED`; shipped means `SHIPPED`. Revenue sums stored order totals for `PLACED`, `PACKED`, and `SHIPPED` orders; `CANCELLED` contributes zero. All sections share one read transaction, with no inventory mutations or schema changes.

`recentOrders` has at most five `{ id, reference, status, totalCents, itemCount, createdAt }` records, ordered by creation date descending then ID descending. `itemCount` is the sum of quantities (total units); totals retain historical order prices. `lowStockProducts` contains `{ id, name, sku, stock }` records at or below the configured threshold, including zero stock, sorted by stock then ID ascending. `generatedAt` and order timestamps are ISO strings. Monetary fields are integer paise. Unsafe aggregate values fail with the standard safe HTTP 500 error instead of returning rounded money. Invalid server configuration or database failures also return HTTP 500 `INTERNAL_SERVER_ERROR`.

The browser validates the response through `src/lib/api-client.ts` before caching it with TanStack Query. Dashboard data refreshes every minute while active, when stale on window focus, and through Refresh. Stale cache time is 30 seconds and failed reads retry once. Loading uses skeletons; errors hide previous figures and show retry controls with a Sonner notification. Empty arrays get dedicated empty states. Currency is formatted as INR, and displayed dates/times use `Asia/Kolkata` (IST). Quick actions link to the existing placeholder pages.

### GET /api/products

Return all products ordered by ID ascending. Body: none.

| Query    | Rules                                                                                    |
| -------- | ---------------------------------------------------------------------------------------- |
| `search` | Optional case-insensitive name-or-SKU literal substring, 1–200 characters after trimming |
| `stock`  | Optional `in_stock` (positive stock) or `out_of_stock` (zero stock)                      |

Filters combine with AND. Empty, repeated, unknown, or invalid query values return 400. The list is not paginated. Success: **200**, `{ "success": true, "data": Product[] }`. Errors: **400** `VALIDATION_ERROR`; **500** `INTERNAL_SERVER_ERROR`.

```sh
curl 'http://localhost:3000/api/products?search=mouse&stock=in_stock'
```

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Wireless Mouse",
      "sku": "ACC-001",
      "description": "A wireless mouse for comfortable everyday navigation at home or in the office.",
      "priceCents": 79900,
      "stock": 25,
      "createdAt": "2026-11-21T08:00:00.000Z",
      "updatedAt": "2026-11-21T08:00:00.000Z"
    }
  ]
}
```

### GET /api/products/[id]

Path: product ID. Query: none consumed; extra query values are ignored. Body: none. Success: **200**, `{ "success": true, "data": Product }`, using the product fields shown above. Errors: **400** `VALIDATION_ERROR` for an invalid ID; **404** `NOT_FOUND` with message `Product not found.`; **500** `INTERNAL_SERVER_ERROR`.

```sh
curl http://localhost:3000/api/products/1
```

### POST /api/orders

Query: none consumed. Body: a strict object containing a nonempty `items` array. Every item contains only `productId` and `quantity`. Unknown fields, including supplied prices, are rejected. All products must exist and have sufficient stock.

```sh
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":"1","quantity":2}]}'
```

Success: **201**, with `OrderSummary` fields plus `items: CreatedItem[]`:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "reference": "ORD-8f587cde-36d5-4799-b354-57572d1bd942",
    "status": "PLACED",
    "items": [
      { "productId": 1, "productName": "Wireless Mouse", "quantity": 2, "unitPriceCents": 79900 }
    ],
    "totalCents": 159800,
    "createdAt": "2026-11-21T08:01:00.000Z"
  }
}
```

Errors: **400** `VALIDATION_ERROR` for invalid JSON, items, duplicate IDs, quantities/IDs, or total overflow; **404** `NOT_FOUND` for a missing product; **409** `INSUFFICIENT_STOCK` or `INVENTORY_CONFLICT`; **500** `INTERNAL_SERVER_ERROR`. Failure rolls back all order, item, stock, and movement writes.

### GET /api/orders

Return order summaries sorted by creation date descending, then ID descending. Body: none.

| Query    | Rules                                                                                  |
| -------- | -------------------------------------------------------------------------------------- |
| `search` | Optional case-insensitive literal reference substring, 1–200 characters after trimming |
| `status` | Optional exact `PLACED`, `PACKED`, `SHIPPED`, or `CANCELLED`                           |
| `page`   | Positive safe integer in decimal digits; default 1                                     |
| `limit`  | Integer 1–100 in decimal digits; default 20                                            |

Filters use AND; totals count matching orders. Empty/repeated/unknown values and unsafe computed offsets are rejected. Beyond-last pages are empty but retain totals. No matches means `total: 0` and `totalPages: 0`.

Success: **200**, `{ "success": true, "data": { "orders": OrderSummary[], "pagination": Pagination } }`. Errors: **400** `VALIDATION_ERROR`; **500** `INTERNAL_SERVER_ERROR`.

```sh
curl 'http://localhost:3000/api/orders?status=PLACED&page=1&limit=20'
```

```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": 1,
        "reference": "ORD-8f587cde-36d5-4799-b354-57572d1bd942",
        "status": "PLACED",
        "totalCents": 159800,
        "createdAt": "2026-11-21T08:01:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

### GET /api/orders/[id]

Path: order ID. Query: none consumed; extra values are ignored. Body: none. Success: **200**, with `OrderSummary` fields plus `items: DetailItem[]`. Monetary values use stored snapshots; total is read from the order. Product name/SKU are current descriptive metadata, not historical name/SKU snapshots.

```json
{
  "success": true,
  "data": {
    "id": 1,
    "reference": "ORD-8f587cde-36d5-4799-b354-57572d1bd942",
    "status": "PLACED",
    "totalCents": 159800,
    "createdAt": "2026-11-21T08:01:00.000Z",
    "items": [
      {
        "id": 1,
        "productId": 1,
        "productName": "Wireless Mouse",
        "sku": "ACC-001",
        "quantity": 2,
        "unitPriceCents": 79900,
        "subtotalCents": 159800
      }
    ]
  }
}
```

Errors: **400** `VALIDATION_ERROR` for an invalid ID; **404** `NOT_FOUND` with message `Order not found.`; **500** `INTERNAL_SERVER_ERROR`.

### PATCH /api/orders/[id]/status

Path: order ID. Query: none consumed. Body: a strict JSON object containing only `status`.

```sh
curl -X PATCH http://localhost:3000/api/orders/1/status \
  -H 'Content-Type: application/json' -d '{"status":"PACKED"}'
```

Only `PLACED` to `PACKED` and `PACKED` to `SHIPPED` succeed. Recognized but disallowed targets, including `PLACED` and `CANCELLED`, return 409; unknown status strings return 400. Fulfilment does not change stock.

Success: **200**, `{ "success": true, "data": OrderRecord }`:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "reference": "ORD-8f587cde-36d5-4799-b354-57572d1bd942",
    "status": "PACKED",
    "totalCents": 159800,
    "createdAt": "2026-11-21T08:01:00.000Z",
    "updatedAt": "2026-11-21T08:02:00.000Z"
  }
}
```

Errors: **400** `VALIDATION_ERROR` for ID/body/JSON; **404** `NOT_FOUND`; **409** `INVALID_TRANSITION` or `INVENTORY_CONFLICT`; **500** `INTERNAL_SERVER_ERROR`.

### POST /api/orders/[id]/cancel

Path: order ID. Query: none consumed. No body is required or read. Allows `PLACED` or `PACKED` to become `CANCELLED`; shipped/already cancelled orders return 409.

```sh
curl -X POST http://localhost:3000/api/orders/1/cancel
```

Success: **200**, `{ "success": true, "data": OrderRecord }`, with `status: "CANCELLED"`. Fields match the fulfilment response; totals and creation dates do not change. Stock restoration, conditional status change, and cancellation movements commit together.

Errors: **400** `VALIDATION_ERROR` for an invalid ID; **404** `NOT_FOUND`; **409** `INVALID_TRANSITION` or `INVENTORY_CONFLICT`; **500** `INTERNAL_SERVER_ERROR`. Repeat cancellation never restores twice. Duplicate restoration movements trigger full rollback rather than being silently ignored.

### GET /api/inventory

Query: the same `search` and `stock` rules as the product list, including AND combinations and rejection of unknown/repeated/invalid values. Body: none. Lists matching inventory ordered by product ID. Stock is read from products; availability is derived from positive versus zero stock. The list is not paginated.

Success: **200**, `{ "success": true, "data": InventoryRecord[] }`:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Wireless Mouse",
      "sku": "ACC-001",
      "priceCents": 79900,
      "stock": 25,
      "availability": "in_stock"
    }
  ]
}
```

Errors: **400** `VALIDATION_ERROR`; **500** `INTERNAL_SERVER_ERROR`. Viewing inventory creates no movements.

### GET /api/inventory/[productId]

Path: product ID. Query: none allowed; any query parameter returns 400. Body: none. Success: **200**, `{ "success": true, "data": InventoryRecord }`, with the fields shown in the inventory array above.

Errors: **400** `VALIDATION_ERROR`; **404** `NOT_FOUND` with message `Product not found.`; **500** `INTERNAL_SERVER_ERROR`.

### GET /api/inventory/[productId]/movements

Path: product ID. Query: only `page` and `limit`, using the order-list rules (defaults 1/20, maximum limit 100, safe offset). Body: none. Unknown/repeated/invalid query values return 400. History is sorted by timestamp descending and movement ID descending, using stored placement/cancellation records joined to order references.

Success: **200**, `{ "success": true, "data": { "product": InventoryRecord, "movements": Movement[], "pagination": Pagination } }`:

```json
{
  "success": true,
  "data": {
    "product": {
      "id": 1,
      "name": "Wireless Mouse",
      "sku": "ACC-001",
      "priceCents": 79900,
      "stock": 23,
      "availability": "in_stock"
    },
    "movements": [
      {
        "id": 1,
        "productId": 1,
        "orderId": 1,
        "orderReference": "ORD-8f587cde-36d5-4799-b354-57572d1bd942",
        "type": "ORDER_PLACED",
        "quantity": 2,
        "createdAt": "2026-11-21T08:01:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

An existing product with no movements returns 200 with an empty array and zero counts. Beyond-last pages are empty but retain totals. Errors: **400** `VALIDATION_ERROR`; **404** `NOT_FOUND` for a missing product; **500** `INTERNAL_SERVER_ERROR`.

## Business rules

- Order items are nonempty, unique by normalized product ID, and have positive integer quantities. Prices come from SQLite, not the request.
- Creation validates all stock before writes, saves unit-price snapshots, creates a `PLACED` order, deducts stock, and writes `ORDER_PLACED` movements in one immediate transaction.
- Any unavailable product rejects the entire order. No partial stock deduction, order, item, or movement survives failure.
- Fulfilment allows only `PLACED` to `PACKED` to `SHIPPED`. No-op, backwards, and all other transitions are rejected.
- Cancellation allows only `PLACED`/`PACKED` to become `CANCELLED`, adding quantities to current stock and recording `ORDER_CANCELLED` once per order/product.
- Immediate locking, conditional updates, and unique movement keys protect concurrent mutations. Timeouts return 409 without partial changes; cancellation also guards stock overflow.
- Cancellation preserves items, original movements, price snapshots, totals, references, and creation timestamps. Product price changes never alter previous orders.
- GET endpoints never mutate stock or create movements. No manual stock adjustment, product mutation, or order deletion is implemented. The dashboard, product catalogue, order creation, and order listing use real backend data; order details and inventory pages remain placeholders.

## Testing and verification

```sh
npm run typecheck
npm run format:check
npm test
npm run test:integration
```

The route/service suite uses migrated, seeded temporary SQLite files and separate processes for real writer contention. `tests/api-contract.test.ts` validates every implemented method's success fields, error envelopes, status codes, ISO dates, and integer amounts without changing production contracts.

The integration command builds Next.js, starts a production server on an available localhost port using an isolated database, and restarts it against the same file. It needs permission to listen on localhost. No external service is required. If a development database exists, its application rows are compared before and after. Temporary servers and files are cleaned up.

| Production workflow | Checks                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| A: fulfilment       | Order two mice; stock 25 to 23; retrieve details; pack; ship; reject cancellation; retain 23            |
| B: cancellation     | Order three mice from 23; stock 20; cancel back to 23; reject repeat; exactly one cancellation movement |
| C: unavailable item | Two available products plus zero-stock webcam reject all; every application row remains unchanged       |

Additional checks cover late-write rollback and safe 500 errors, retry after cancellation failure, historical prices, repeat migrations/seeds, invalid inputs, and persistence after restart. The database verifier checks all four tables, foreign-key enforcement/integrity, repeat migrations, and 41 invalid-write constraints in memory. Inventory GET tests also run with SQLite writes disabled.

For migration metadata consistency, run `node node_modules/drizzle-kit/bin.cjs check`. Schema generation should report no changes on an unchanged checkout. Formatting excludes generated migrations and metadata.

## Submission and remaining issues

All eleven API methods, reproducible setup, persistent SQLite storage, and contract/business/integration tests are included. Keep migration files and the lockfile in the submission. Seed products are reproducible; databases and local environment files are excluded. README examples insert orders only if you execute their POST commands.

Backend finalization on November 21, 2026 executed 262 route/service/contract tests and 10 production HTTP integration tests (55 HTTP requests), all passing. The production build, strict TypeScript, formatting, migration consistency, and schema drift checks passed. Clean database setup, repeated seeding without inventory/price resets, application restart persistence, and 41 invalid-write constraint checks passed. Development database rows remained unchanged.

Step 10.1 frontend verification reran all 262 backend tests and all 10 production integration tests (55 HTTP requests); all passed and development database rows remained unchanged. The Webpack production build, strict TypeScript, and formatting passed. All six frontend routes returned 200, and `/` returned a 307 redirect to `/dashboard`. Browser checks covered desktop/sidebar persistence, phone and tablet layouts, mobile navigation, breadcrumbs, profile/notification menus, dialogs, keyboard dismissal, focus trapping, and focus restoration. Backend APIs, schema, services, and tests were not changed.

Step 10.2 verification passed 279 route/service/client/format tests and 11 production integration tests (56 HTTP requests). Dashboard totals, latest order IDs/unit counts, low-stock boundaries, historical prices, read-only behavior, and empty/error responses were checked against isolated SQLite databases. Browser checks verified real development records, empty data, a forced database failure and retry recovery, loading skeletons, details navigation, and 390px/768px/1440px layouts. A mobile overflow issue in the shared table wrapper was corrected. Strict TypeScript, formatting, and the production build passed. Existing order mutation logic and database schema remain unchanged.

Step 10.3 verification passed 288 automated tests, including nine catalogue URL/client/rendering tests against real seeded API responses, and all 11 production integration tests (56 HTTP requests). TypeScript, production build, and formatting passed. Browser checks covered all six seeded products, name and SKU searches, both stock filters, combined filters, URL reload persistence, product details and focus restoration, loading skeletons, no-match and genuinely empty catalogues, missing/invalid product IDs, forced list/detail API failures and retry recovery, and phone/tablet/desktop layouts. Failure/empty checks used a separate temporary SQLite database. No backend implementation, database schema, dependency, or development product data was changed.

Step 10.4 verification passed 304 automated tests, including 16 new cart/client/rendering/integration checks, and all 11 production integration tests (56 HTTP requests). Strict TypeScript, production build, and formatting passed. Browser checks covered name/SKU search, multiple products, repeated additions, increment/decrement, removal, out-of-stock controls, stock limits, exact totals, cart preservation after real 409 and injected 500/network failures, a delayed double-click submission producing exactly one order, confirmed reference/prices, success notification, cart clearing, refreshed inventory/dashboard, details-route navigation, and phone/tablet/desktop layouts. Search was separated from checkout to prevent Enter from submitting; a regression test also covers quantity recovery after a stock drop. All checkout writes and fault injection used an isolated SQLite database and temporary local servers, which were stopped afterward. Development order count remained unchanged during browser keyboard checks. No backend defect or business logic/schema change was required.

Step 10.5 verification passed 317 automated tests, including 13 new order listing validation, URL, API, and rendering checks against isolated SQLite fixtures, and all 11 production integration tests (56 HTTP requests). Strict TypeScript, production build, formatting, and whitespace checks passed. Browser checks covered live order records, exact and unmatched reference searches, all four status filters, combined filters, pagination and page sizes, URL preservation and Back navigation, historical totals and total units, loading states, individual item-count failures and retry, list API failure and recovery, an empty database, out-of-range pages, create/details navigation, and phone/tablet/desktop layouts. Failure and empty-state checks used a temporary SQLite database, and its preview server was stopped afterward. No backend business logic, schema, or dependencies changed. Order details links reach the existing placeholder page; a complete details UI is reserved for a later step.

The final dependency audit reports zero runtime findings and four moderate findings in Drizzle Kit's development-only esbuild chain. npm proposes a breaking downgrade, so working migration tooling is retained. A compatible upstream resolution remains outstanding. Authentication, custom CORS, remaining frontend workflows, and general production hardening are outside the implemented hackathon scope.
