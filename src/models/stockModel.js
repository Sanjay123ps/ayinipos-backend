import { pool } from '../config/db.js'

// Applies a stock delta to a product and records it in the ledger.
// Pass a transaction `client` when calling this from inside withTransaction;
// defaults to the pool for standalone calls (e.g. manual adjustments).
export async function applyStockDelta(productId, delta, reason, client = pool) {
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
