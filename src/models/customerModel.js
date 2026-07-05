import { pool } from '../config/db.js'

export async function getAllCustomers() {
  const { rows } = await pool.query(
    `SELECT id, name, mobile, address, created_at
     FROM customers
     ORDER BY name ASC NULLS LAST, mobile ASC`
  )
  return rows
}

// Powers the Billing screen's autofill-as-you-type: given a partial mobile
// number, returns matching customers so the operator can pick one and have
// name/address filled in automatically.
export async function searchCustomersByMobile(prefix, limit = 8) {
  if (!prefix) return []
  const { rows } = await pool.query(
    `SELECT id, name, mobile, address
     FROM customers
     WHERE mobile LIKE $1
     ORDER BY mobile ASC
     LIMIT $2`,
    [`${prefix}%`, limit]
  )
  return rows
}

export async function getCustomerByMobile(mobile, client = pool) {
  if (!mobile) return null
  const { rows } = await client.query(
    `SELECT id, name, mobile, address FROM customers WHERE mobile = $1`,
    [mobile]
  )
  return rows[0] || null
}

// Looks up a customer by mobile, creating or refreshing it if a name was
// supplied — lets the Billing form capture new customers inline the same
// way findOrCreateSupplier does for purchases. Returns the customer id
// (or null if no mobile was given, since customer capture is optional).
export async function findOrCreateCustomer({ mobile, name, address }, client = pool) {
  if (!mobile) return null
  const { rows } = await client.query(
    `INSERT INTO customers (mobile, name, address)
     VALUES ($1, $2, $3)
     ON CONFLICT (mobile) DO UPDATE
       SET name       = COALESCE(EXCLUDED.name, customers.name),
           address    = COALESCE(EXCLUDED.address, customers.address),
           updated_at = now()
     RETURNING id`,
    [mobile, name || null, address || null]
  )
  return rows[0].id
}

export async function updateCustomer(id, { name, mobile, address }) {
  const { rows } = await pool.query(
    `UPDATE customers
     SET name = $1, mobile = $2, address = $3, updated_at = now()
     WHERE id = $4
     RETURNING id, name, mobile, address`,
    [name || null, mobile, address || null, id]
  )
  if (!rows[0]) {
    const err = new Error('Customer not found')
    err.status = 404
    throw err
  }
  return rows[0]
}
