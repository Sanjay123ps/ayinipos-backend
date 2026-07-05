import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../config/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  console.log('Running schema.sql against', process.env.DATABASE_URL ? 'DATABASE_URL' : process.env.PGDATABASE || 'ayini_pos')
  await pool.query(sql)
  console.log('✅ Migration complete')
  await pool.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
