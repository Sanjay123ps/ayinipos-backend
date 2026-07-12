# Ayini POS V2 — Backend

Express + PostgreSQL API for the Supermarket Billing & Inventory system.
Pairs with the frontend in `../ayini-pos-v2` (set `VITE_API_URL` there to
point at this server).

## Run it locally

You'll need a local PostgreSQL instance (or a `DATABASE_URL` to a remote one).

```bash
cp .env.example .env        # then edit PGUSER/PGPASSWORD/PGDATABASE as needed
npm install
npm run db:migrate          # creates all tables
npm run db:seed             # creates the admin user + a few starter products
npm run dev
```

Default login after seeding: **admin / admin123** (override via
`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` in `.env` before seeding).

The API listens on `http://localhost:4000` by default. `GET /health` is an
unauthenticated check you can hit to confirm it's up.

## Folder structure

```
src/
  config/db.js        Postgres pool + withTransaction() helper
  db/schema.sql        all table definitions (run by db:migrate)
  db/migrate.js         runs schema.sql
  db/seed.js            creates admin user + starter products
  models/               one file per table — all raw SQL lives here
  controllers/           thin request/response layer, calls models
  routes/                 one router per resource, mounted in routes/index.js
  middleware/auth.js       JWT verification
  middleware/errorHandler.js
  app.js / server.js
```

## API reference

All routes are mounted under `/api`. Everything except `/api/auth/login`
requires `Authorization: Bearer <token>`.

| Method | Path                          | Notes |
|--------|-------------------------------|-------|
| POST   | `/api/auth/login`             | `{ username, password }` → `{ token, user }` |
| GET    | `/api/products`               | |
| GET    | `/api/products/categories`    | |
| POST   | `/api/products`               | add product |
| PUT    | `/api/products/:id`           | edit product |
| DELETE | `/api/products/:id`           | |
| PATCH  | `/api/products/:id/stock`     | `{ delta, reason }` — manual stock adjustment |
| GET    | `/api/products/:id/stock-history` | last 50 stock movements for that product |
| GET    | `/api/purchases?from=&to=`     | purchase history, optionally scoped to a date range |
| GET    | `/api/purchases/suppliers`     | |
| POST   | `/api/purchases`               | records a purchase **and** bumps product stock, in one transaction |
| POST   | `/api/bills`                   | creates a sale, decrements stock, in one transaction |
| GET    | `/api/dashboard/summary?from=&to=` | today/monthly sales (always calendar-fixed), orders/products/revenue (all-time), plus rangeRevenue/rangeOrders scoped to from/to when given |
| GET    | `/api/dashboard/sales-trend?from=&to=` | daily series; defaults to the last 7 days, or spans from/to when given (capped at 60 days) |
| GET    | `/api/dashboard/best-sellers?from=&to=` | optionally scoped to a date range |
| GET    | `/api/dashboard/recent-sales`  | |
| GET    | `/api/sessions`                | till history |
| POST   | `/api/sessions`                | closes a till session (denomination count → total/difference computed server-side) |
| GET    | `/api/settings`                | |
| PUT    | `/api/settings`                | |

## Design notes

- **Stock is a ledger, not just a number.** Every purchase, sale, and manual
  correction writes a row to `stock_adjustments` *and* updates the
  denormalized `products.stock` count, inside the same DB transaction. That
  table doubles as the "Stock History" the spec calls for under Inventory.
- **Profit/cost tracking is not implemented in this version.** `products`
  has a `purchase_price` column and `sale_items` has a `cost_price` column,
  but neither the product form nor the purchase-entry flow collects a
  purchase price (see the comments in `productModel.js` and
  `purchaseModel.js`) — that was a deliberate scope cut, not an oversight.
  Both columns exist purely so a future version can add real cost tracking
  without a schema migration, but today they're always `0`. No endpoint
  returns a `profit` field. If cost tracking gets built later, wire
  `products.purchase_price` into `createSale`'s product lookup (right next
  to where price/gst are already read) and it'll flow through everywhere
  else with a real, per-sale-accurate cost snapshot.
- **Bill/purchase/session numbers** (`BILL-3001`, `PUR-1001`, `SES-201`) are
  generated from the row's serial id after insert, so they're guaranteed
  unique without a separate counter table.

## Deploying (Railway)

Matches the GitHub → Railway pattern used for EggMart POS:

1. Push this folder to its own GitHub repo (or a `backend/` subfolder).
2. In Railway: New Project → Deploy from GitHub → add a **PostgreSQL** plugin
   to the same project. Railway sets `DATABASE_URL` automatically.
3. Set the remaining env vars from `.env.example` (`JWT_SECRET`,
   `CORS_ORIGIN` → your Vercel frontend URL, `SEED_ADMIN_USERNAME`/`PASSWORD`
   if you want non-default seed credentials).
4. After the first deploy, run migrate + seed once via Railway's shell
   (`railway run npm run db:migrate && railway run npm run db:seed`), then
   `railway run npm run db:import-products` once to load the real 63-item
   Ayini catalog (safe to re-run — it skips products that already exist).
5. Point the frontend's `VITE_API_URL` at the Railway-issued domain.

`railway.json` in this repo already sets the Nixpacks build + start command.
