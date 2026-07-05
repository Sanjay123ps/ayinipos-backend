import { pool } from '../config/db.js'

export async function getAllSuppliers() {
  const { rows } = await pool.query('SELECT id, name FROM suppliers ORDER BY name ASC')
  return rows
}

// Looks up a supplier by name, creating it if it doesn't exist yet —
// lets the Purchase form accept free-text supplier names.
export async function findOrCreateSupplier(name, client = pool) {
  if (!name) return null
  const { rows } = await client.query(
    `INSERT INTO suppliers (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name]
  )
  return rows[0].id
}
