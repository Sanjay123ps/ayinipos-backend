import { pool, withTransaction } from '../config/db.js'
import { applyStockDelta } from './stockModel.js'

// NOTE: purchasePrice is intentionally excluded from the API-facing shape.
// The client does not maintain purchase prices (they fluctuate with the
// market), so this value is never surfaced in responses or used in any
// business logic. The `purchase_price` column itself is left untouched in
// the database for future compatibility.
function toApiShape(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    barcode: row.barcode,
    price: Number(row.price),
    gst: Number(row.gst),
    stock: row.stock,
    lowStockLimit: row.low_stock_limit,
    emoji: row.emoji,
    image: row.image,
    unit: row.unit,
    trackStock: row.track_stock,
  }
}

export async function getAllProducts() {
  const { rows } = await pool.query('SELECT * FROM products ORDER BY name ASC')
  return rows.map(toApiShape)
}

export async function getProductById(id, client = pool) {
  const { rows } = await client.query('SELECT * FROM products WHERE id = $1', [id])
  return rows[0] ? toApiShape(rows[0]) : null
}

export async function getCategories() {
  const { rows } = await pool.query('SELECT DISTINCT category FROM products ORDER BY category ASC')
  return rows.map((r) => r.category)
}

export async function createProduct(payload) {
  // purchasePrice is no longer collected from clients; the column keeps its
  // DB default (0) for any newly created product.
  const { name, category, barcode, price, gst, stock, lowStockLimit, emoji, image, unit, trackStock } = payload
  const { rows } = await pool.query(
    `INSERT INTO products (name, category, barcode, price, gst, stock, low_stock_limit, emoji, image, unit, track_stock)
     VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, '🛒'), $9, COALESCE($10, 'pcs'), COALESCE($11, true))
     RETURNING *`,
    [
      name,
      category,
      barcode || null,
      price || 0,
      gst || 0,
      stock || 0,
      lowStockLimit || 10,
      emoji,
      image || null,
      unit || 'pcs',
      trackStock === undefined ? true : trackStock,
    ]
  )
  return toApiShape(rows[0])
}

export async function updateProduct(id, payload) {
  return withTransaction(async (client) => {
    const existing = await getProductById(id, client)
    if (!existing) return null
    const merged = { ...existing, ...payload }

    // purchase_price is deliberately left out of this UPDATE so existing
    // values are preserved untouched — it is not part of the edit form anymore.
    const { rows } = await client.query(
      `UPDATE products
       SET name = $1, category = $2, barcode = $3, price = $4,
           gst = $5, low_stock_limit = $6, emoji = COALESCE($7, emoji),
           image = $8, unit = $9, track_stock = $10, updated_at = now()
       WHERE id = $11
       RETURNING *`,
      [
        merged.name,
        merged.category,
        merged.barcode,
        merged.price,
        merged.gst,
        merged.lowStockLimit,
        merged.emoji,
        merged.image,
        merged.unit || 'pcs',
        merged.trackStock === undefined ? true : merged.trackStock,
        id,
      ]
    )
    let updated = rows[0] ? toApiShape(rows[0]) : null
    if (!updated) return null

    // The Stock field on the Add/Edit form used to be silently dropped —
    // the UPDATE above never touched it, so "Product updated" would show
    // even though stock was left unchanged. A stock edit here is routed
    // through applyStockDelta (not a raw SET) so it lands in
    // stock_adjustments like every other stock movement — sales,
    // purchases, and the Inventory tab's +/- stepper all already go
    // through that same ledger, and this keeps it that way.
    const requestedStock = payload.stock
    if (updated.trackStock && requestedStock !== undefined && requestedStock !== null) {
      const newStock = Number(requestedStock)
      if (Number.isFinite(newStock) && newStock >= 0 && Math.round(newStock) !== existing.stock) {
        const delta = Math.round(newStock) - existing.stock
        const newStockValue = await applyStockDelta(id, delta, 'Stock corrected via product edit', client)
        updated = { ...updated, stock: newStockValue }
      }
    }

    return updated
  })
}

export async function deleteProduct(id) {
  await pool.query('DELETE FROM products WHERE id = $1', [id])
  return true
}

export async function setStock(id, newStock, client = pool) {
  await client.query('UPDATE products SET stock = $1, updated_at = now() WHERE id = $2', [newStock, id])
}

export { toApiShape as productToApiShape }
