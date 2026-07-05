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
| GET    | `/api/purchases`               | purchase history |
| GET    | `/api/purchases/suppliers`     | |
| POST   | `/api/purchases`               | records a purchase **and** bumps product stock, in one transaction |
| POST   | `/api/bills`                   | creates a sale, decrements stock, in one transaction |
| GET    | `/api/dashboard/summary`       | today/monthly sales, orders, products, revenue, profit |
| GET    | `/api/dashboard/sales-trend`   | last 7 days |
| GET    | `/api/dashboard/best-sellers`  | |
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
- **Profit uses a real cost snapshot.** `sale_items.cost_price` captures each
  product's purchase price *at the moment of sale*, so profit reporting stays
  accurate even after purchase prices change later — it's not just
  `current price − current purchase price`.
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
   (`railway run npm run db:migrate && railway run npm run db:seed`).
5. Point the frontend's `VITE_API_URL` at the Railway-issued domain.

`railway.json` in this repo already sets the Nixpacks build + start command.
