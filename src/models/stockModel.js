import { pool } from '../config/db.js'

// Applies a stock delta to a product and records it in the ledger.
// Pass a transaction `client` when calling this from inside withTransaction;
// defaults to the pool for standalone calls (e.g. manual adjustments).
export async function applyStockDelta(productId, delta, reason, client = pool) {
  // node-postgres returns NUMERIC/DECIMAL columns as strings (not numbers) to
  // avoid float precision loss, so a delta read back from sale_items.quantity
  // (NUMERIC(10,3)) arrives here as "8.000", not 8. Number.isInteger() returns
  // false for ANY string regardless of value, so this coercion has to happen
  // before the check — otherwise every stock-tracked bill deletion fails, not
  // just genuinely fractional ones.
  delta = Number(delta)
  if (!Number.isInteger(delta)) {
    const err = new Error(
      `Stock delta must be a whole number (got ${delta}). This product may not track stock, or the caller forgot to check track_stock.`
    )
    err.status = 400
    throw err
  }

  const { rows } = await client.query(
    `UPDATE products SET stock = GREATEST(stock + $1, 0), updated_at = now()
     WHERE id = $2
     RETURNING stock`,
    [delta, productId]
  )
  if (rows.length === 0) {
    const err = new Error(`Product ${productId} not found`)
    err.status = 404
    throw err
  }
  await client.query(
    `INSERT INTO stock_adjustments (product_id, delta, reason) VALUES ($1, $2, $3)`,
    [productId, delta, reason]
  )
  return rows[0].stock
}

export async function getStockHistory(productId) {
  const { rows } = await pool.query(
    `SELECT id, delta, reason, created_at AS "createdAt"
     FROM stock_adjustments WHERE product_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [productId]
  )
  return rows
}
