import { pool } from '../config/db.js'

export async function findUserByUsername(username) {
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username])
  return rows[0] || null
}

export async function findUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id])
  return rows[0] || null
}

export async function updateUserPassword(id, passwordHash) {
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id])
}
