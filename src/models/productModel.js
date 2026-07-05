import { pool } from '../config/db.js'

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
  const { name, category, barcode, price, gst, stock, lowStockLimit, emoji } = payload
  const { rows } = await pool.query(
    `INSERT INTO products (name, category, barcode, price, gst, stock, low_stock_limit, emoji)
     VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, '🛒'))
     RETURNING *`,
    [name, category, barcode || null, price || 0, gst || 0, stock || 0, lowStockLimit || 10, emoji]
  )
  return toApiShape(rows[0])
}

export async function updateProduct(id, payload) {
  const existing = await getProductById(id)
  if (!existing) return null
  const merged = { ...existing, ...payload }
  // purchase_price is deliberately left out of this UPDATE so existing
  // values are preserved untouched — it is not part of the edit form anymore.
  const { rows } = await pool.query(
    `UPDATE products
     SET name = $1, category = $2, barcode = $3, price = $4,
         gst = $5, low_stock_limit = $6, emoji = COALESCE($7, emoji), updated_at = now()
     WHERE id = $8
     RETURNING *`,
    [
      merged.name,
      merged.category,
      merged.barcode,
      merged.price,
      merged.gst,
      merged.lowStockLimit,
      merged.emoji,
      id,
    ]
  )
  return rows[0] ? toApiShape(rows[0]) : null
}

export async function deleteProduct(id) {
  await pool.query('DELETE FROM products WHERE id = $1', [id])
  return true
}

export async function setStock(id, newStock, client = pool) {
  await client.query('UPDATE products SET stock = $1, updated_at = now() WHERE id = $2', [newStock, id])
}

export { toApiShape as productToApiShape }
