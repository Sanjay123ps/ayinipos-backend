import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin123'

const sampleProducts = []

async function seed() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
  await pool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [ADMIN_USERNAME, passwordHash]
  )
  console.log(`✅ Admin user ready → username: ${ADMIN_USERNAME} / password: ${ADMIN_PASSWORD}`)

  const { rows: existing } = await pool.query('SELECT COUNT(*)::int AS count FROM products')
  if (existing[0].count === 0) {
    for (const p of sampleProducts) {
      await pool.query(
        `INSERT INTO products (name, category, barcode, purchase_price, price, gst, stock, low_stock_limit, emoji)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [p.name, p.category, p.barcode, p.purchase_price, p.price, p.gst, p.stock, p.low_stock_limit, p.emoji]
      )
    }
    console.log(`✅ Seeded ${sampleProducts.length} starter products`)
  } else {
    console.log('Products already exist — skipped product seeding')
  }

  await pool.end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
