// Clears all business data while preserving the schema, as required by the
// V2 spec ("Clear all existing data while preserving schema"). Deliberately
// leaves `users` and `settings` untouched so the store can still log in and
// keeps its billing/GST configuration after a reset.
//
// Usage: npm run db:reset            (asks for confirmation)
//        npm run db:reset -- --yes   (skips confirmation, for CI/scripts)
import readline from 'readline'
import { pool } from '../config/db.js'

// Order matters: children before parents so FK constraints don't block the
// truncate even though CASCADE would handle it anyway — being explicit
// makes it obvious exactly what gets wiped.
const TABLES_TO_CLEAR = [
  'stock_adjustments',
  'sale_items',
  'sales',
  'purchase_items',
  'purchases',
  'products',
  'customers',
  'suppliers',
  'sessions',
]

async function confirm() {
  if (process.argv.includes('--yes')) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => {
    rl.question(
      `This will permanently delete all data from: ${TABLES_TO_CLEAR.join(', ')}\n` +
        'Users and settings are kept. Continue? (yes/no): ',
      resolve
    )
  })
  rl.close()
  return answer.trim().toLowerCase() === 'yes'
}

async function reset() {
  const ok = await confirm()
  if (!ok) {
    console.log('Aborted — no data was changed.')
    await pool.end()
    return
  }

  await pool.query(`TRUNCATE ${TABLES_TO_CLEAR.join(', ')} RESTART IDENTITY CASCADE`)
  console.log(`✅ Cleared data from: ${TABLES_TO_CLEAR.join(', ')}`)
  console.log('   Schema, users, and settings were preserved.')
  await pool.end()
}

reset().catch((err) => {
  console.error('Reset failed:', err)
  process.exit(1)
})
