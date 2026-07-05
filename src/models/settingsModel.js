import { pool } from '../config/db.js'

function toApiShape(row) {
  return {
    storeName: row.store_name,
    gstNumber: row.gst_number,
    gstDefaultRate: Number(row.gst_default_rate),
    address: row.address,
    billFooter: row.bill_footer,
    theme: row.theme,
    logoEmoji: row.logo_emoji,
  }
}

export async function getSettings() {
  const { rows } = await pool.query('SELECT * FROM settings WHERE id = 1')
  return toApiShape(rows[0])
}

export async function updateSettings(payload) {
  const current = await getSettings()
  const merged = { ...current, ...payload }
  const { rows } = await pool.query(
    `UPDATE settings
     SET store_name = $1, gst_number = $2, gst_default_rate = $3, address = $4, bill_footer = $5, theme = $6, logo_emoji = $7, updated_at = now()
     WHERE id = 1
     RETURNING *`,
    [merged.storeName, merged.gstNumber, merged.gstDefaultRate, merged.address, merged.billFooter, merged.theme, merged.logoEmoji]
  )
  return toApiShape(rows[0])
}
