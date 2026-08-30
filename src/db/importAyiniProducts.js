// Syncs the Ayini Home Products catalog from ayini-products-seed.json
// into the products table. New barcodes are INSERTed; existing barcodes
// are UPDATEd (name/category/price/gst/low_stock_limit/emoji). Stock is
// intentionally NOT touched on update — re-running this must never
// overwrite real, live inventory counts with the seed default.
//
// Usage:  npm run db:import-products
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from '../config/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const products = JSON.parse(readFileSync(join(__dirname, 'ayini-products-seed.json'), 'utf8'))

async function run() {
  let inserted = 0
  let updated = 0

  for (const p of products) {
    const { rows: existing } = await pool.query('SELECT id FROM products WHERE barcode = $1', [p.barcode])

    if (existing.length > 0) {
      await pool.query(
        `UPDATE products
         SET name = $1, category = $2, price = $3, gst = $4, low_stock_limit = $5, emoji = $6, updated_at = now()
         WHERE id = $7`,
        [p.name, p.category, p.price, p.gst, p.lowStockLimit, p.emoji, existing[0].id]
      )
      updated++
    } else {
      await pool.query(
        `INSERT INTO products (name, category, barcode, price, gst, stock, low_stock_limit, emoji)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [p.name, p.category, p.barcode, p.price, p.gst, p.stock, p.lowStockLimit, p.emoji]
      )
      inserted++
    }
  }

  console.log(`✅ Synced catalog: ${inserted} new, ${updated} updated`)
  await pool.end()
}

run().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
