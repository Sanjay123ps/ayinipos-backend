-- Ayini POS V2 — schema
-- Run via `npm run db:migrate`

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  barcode          TEXT,
  purchase_price   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  price            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  gst              NUMERIC(5, 2) NOT NULL DEFAULT 0,
  stock            INTEGER NOT NULL DEFAULT 0,
  low_stock_limit  INTEGER NOT NULL DEFAULT 10,
  emoji            TEXT NOT NULL DEFAULT '🛒',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS suppliers (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer database for billing autofill (Credit Bills, repeat-customer lookup).
-- Mobile number is the natural key: the Billing screen looks a customer up
-- by mobile as it's typed and offers to auto-fill their name/address.
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       TEXT,
  mobile     TEXT NOT NULL UNIQUE,
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);

CREATE TABLE IF NOT EXISTS purchases (
  id            SERIAL PRIMARY KEY,
  bill_no       TEXT UNIQUE,
  supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  invoice_no    TEXT,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  gst_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent upgrade path for databases created before multi-item bills.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS purchase_items (
  id              SERIAL PRIMARY KEY,
  purchase_id     INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name    TEXT NOT NULL,
  unit            TEXT NOT NULL DEFAULT 'pcs',
  quantity        NUMERIC(10, 2) NOT NULL,
  purchase_price  NUMERIC(10, 2) NOT NULL,
  selling_price   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  gst_rate        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(10, 2) NOT NULL,
  amount          NUMERIC(10, 2) NOT NULL
);

-- Idempotent upgrade path: older rows only had quantity/purchase_price/amount.
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(10, 2);
UPDATE purchase_items SET line_total = amount WHERE line_total IS NULL;
ALTER TABLE purchase_items ALTER COLUMN line_total SET NOT NULL;

CREATE TABLE IF NOT EXISTS sales (
  id                 SERIAL PRIMARY KEY,
  bill_no            TEXT UNIQUE,
  customer_id        INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_mobile    TEXT,
  customer_name      TEXT,
  discount_percent   NUMERIC(5, 2) NOT NULL DEFAULT 0,
  subtotal           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  gst_amount         NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total              NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_mode       TEXT NOT NULL DEFAULT 'Cash',
  -- Credit Bills: only meaningful when payment_mode = 'Credit'.
  -- credit_status tracks whether the bill is still outstanding or has
  -- since been closed out with a real payment method.
  credit_status      TEXT NOT NULL DEFAULT 'none'
                        CHECK (credit_status IN ('none', 'pending', 'paid')),
  credit_closed_mode TEXT
                        CHECK (credit_closed_mode IS NULL OR credit_closed_mode IN ('Cash', 'Card', 'UPI')),
  credit_closed_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent upgrade path for databases created before these columns existed.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS credit_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS credit_closed_mode TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS credit_closed_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_credit_status_check'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_credit_status_check
      CHECK (credit_status IN ('none', 'pending', 'paid'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_credit_closed_mode_check'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_credit_closed_mode_check
      CHECK (credit_closed_mode IS NULL OR credit_closed_mode IN ('Cash', 'Card', 'UPI'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_credit_status ON sales(credit_status) WHERE credit_status = 'pending';

CREATE TABLE IF NOT EXISTS sale_items (
  id           SERIAL PRIMARY KEY,
  sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  price        NUMERIC(10, 2) NOT NULL,
  cost_price   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  gst          NUMERIC(5, 2) NOT NULL DEFAULT 0,
  quantity     NUMERIC(10, 3) NOT NULL,
  line_total   NUMERIC(10, 2) NOT NULL
);

-- Idempotent upgrade path: quantity used to be INTEGER, which can't hold a
-- weight like 0.75 kg for weight-priced products (see products.unit below).
ALTER TABLE sale_items ALTER COLUMN quantity TYPE NUMERIC(10, 3);

-- Append-only ledger for every stock movement (sale, purchase, manual
-- correction). products.stock is a denormalized running total kept in sync
-- with this table inside the same transaction, so this also doubles as the
-- "Stock History" the spec asks for under Inventory.
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta      NUMERIC(10, 3) NOT NULL,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_adjustments ALTER COLUMN delta TYPE NUMERIC(10, 3);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON stock_adjustments(product_id);

CREATE TABLE IF NOT EXISTS sessions (
  id             SERIAL PRIMARY KEY,
  session_no     TEXT UNIQUE,
  opening_time   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closing_time   TIMESTAMPTZ,
  opening_cash   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  closing_cash   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes_500      INTEGER NOT NULL DEFAULT 0,
  notes_200      INTEGER NOT NULL DEFAULT 0,
  notes_100      INTEGER NOT NULL DEFAULT 0,
  notes_50       INTEGER NOT NULL DEFAULT 0,
  notes_20       INTEGER NOT NULL DEFAULT 0,
  notes_10       INTEGER NOT NULL DEFAULT 0,
  coins          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_cash     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  difference     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  remarks        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  store_name       TEXT NOT NULL DEFAULT '',
  gst_number       TEXT,
  gst_default_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  address          TEXT,
  bill_footer      TEXT,
  theme            TEXT NOT NULL DEFAULT 'light',
  logo_emoji       TEXT NOT NULL DEFAULT '',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);

-- Idempotent upgrade path for databases created before this column existed.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gst_default_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Stores the compressed photo (base64 data URL) captured by the Add/Edit
-- Product form's file picker. TEXT has no meaningful size ceiling in
-- Postgres, but this is a pragmatic choice for a single-store catalog —
-- moving to object storage (S3/Cloudinary) with just a URL here would be
-- the sturdier path if the catalog grows much larger.
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;

-- purchase_items originally used ON DELETE RESTRICT (and NOT NULL) on
-- product_id, which blocks deleting any product that has ever appeared on
-- a purchase bill with a hard 500 error. sale_items already solves this
-- correctly with ON DELETE SET NULL (product_name is stored separately as
-- a text snapshot, so historical records stay meaningful either way) —
-- this brings purchase_items in line with that same, already-proven fix.
ALTER TABLE purchase_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE purchase_items DROP CONSTRAINT IF EXISTS purchase_items_product_id_fkey;
ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- `unit` distinguishes ordinary piece-counted products ('pcs') from
-- weight-priced ones ('kg') like "Idly maavu grinding" (₹10/kg) — the
-- Billing screen shows a weight input instead of a +/- qty stepper for
-- 'kg' products. `track_stock` lets a product opt out of stock tracking
-- entirely (a grinding service has no fixed inventory), so it never shows
-- "out of stock" and sales never touch its stock count.
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT true;

-- Purchase Page Enhancement:
-- * `bill_image` holds the supplier's photographed bill as a base64 data
--   URL (same storage pattern as products.image above) — record-keeping
--   only, deliberately never read by CSV export or any calculation.
-- * `notes` is a free-text field surfaced in Purchase History and export.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS bill_image TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS notes TEXT;

-- `product_type` distinguishes catalog products (linked via product_id)
-- from manual/non-catalog purchase lines (packing material, transport
-- charges, etc.) that exist only inside this one purchase bill and must
-- never spawn a row in `products`. purchase_price/line_total already
-- existed as legacy columns (previously always written as 0); they are now
-- populated with real, manually-entered values.
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'catalog';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_product_type_check'
  ) THEN
    ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_product_type_check
      CHECK (product_type IN ('catalog', 'manual'));
  END IF;
END $$;
-- Backfill: any existing row with no linked product must be manual.
UPDATE purchase_items SET product_type = 'manual' WHERE product_id IS NULL AND product_type = 'catalog';
