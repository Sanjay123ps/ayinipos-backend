import { pool } from '../config/db.js'

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

export async function getAllSessions(limit = 20) {
  const { rows } = await pool.query(
    `SELECT session_no AS id,
            to_char(opening_time, 'YYYY-MM-DD HH12:MI AM') AS "openingTime",
            to_char(closing_time, 'YYYY-MM-DD HH12:MI AM') AS "closingTime",
            opening_cash AS "openingCash", closing_cash AS "closingCash",
            total_cash AS "totalCash", difference, remarks
     FROM sessions
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  )
  return rows.map((r) => ({
    ...r,
    openingCash: Number(r.openingCash),
    closingCash: Number(r.closingCash),
    totalCash: Number(r.totalCash),
    difference: Number(r.difference),
  }))
}

export async function createSession(payload) {
  const d = payload.denominations || {}
  const notes500 = Number(d[500]) || 0
  const notes200 = Number(d[200]) || 0
  const notes100 = Number(d[100]) || 0
  const notes50 = Number(d[50]) || 0
  const notes20 = Number(d[20]) || 0
  const notes10 = Number(d[10]) || 0
  const coins = Number(d.coins) || 0

  const totalCash = round2(
    notes500 * 500 + notes200 * 200 + notes100 * 100 + notes50 * 50 + notes20 * 20 + notes10 * 10 + coins
  )
  const closingCash = Number(payload.closingCash) || 0
  const difference = round2(totalCash - closingCash)

  const { rows } = await pool.query(
    `INSERT INTO sessions
       (opening_time, closing_time, opening_cash, closing_cash, notes_500, notes_200, notes_100, notes_50, notes_20, notes_10, coins, total_cash, difference, remarks)
     VALUES (COALESCE($1, now()), now(), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, opening_time, closing_time`,
    [
      payload.openingTimeISO || null,
      Number(payload.openingCash) || 0,
      closingCash,
      notes500,
      notes200,
      notes100,
      notes50,
      notes20,
      notes10,
      coins,
      totalCash,
      difference,
      payload.remarks || null,
    ]
  )
  const sessionId = rows[0].id
  const sessionNo = `SES-${200 + sessionId}`
  await pool.query('UPDATE sessions SET session_no = $1 WHERE id = $2', [sessionNo, sessionId])

  return {
    id: sessionNo,
    openingTime: payload.openingTime,
    closingTime: payload.closingTime,
    openingCash: Number(payload.openingCash) || 0,
    closingCash,
    totalCash,
    difference,
    remarks: payload.remarks || '',
  }
}
