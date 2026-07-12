// One-time import of the real Ayini Home Products catalog (extracted
// directly from the frontend's mockData.js) into the products table.
// Safe to re-run: skips any product whose barcode already exists, so it
// won't create duplicates if run more than once.
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
  let skipped = 0

  for (const p of products) {
    const { rows: existing } = await pool.query('SELECT id FROM products WHERE barcode = $1', [p.barcode])
    if (existing.length > 0) {
      skipped++
      continue
    }
    await pool.query(
      `INSERT INTO products (name, category, barcode, price, gst, stock, low_stock_limit, emoji)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [p.name, p.category, p.barcode, p.price, p.gst, p.stock, p.lowStockLimit, p.emoji]
    )
    inserted++
  }

  console.log(`✅ Imported ${inserted} products (${skipped} already existed, skipped)`)
  await pool.end()
}

run().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
