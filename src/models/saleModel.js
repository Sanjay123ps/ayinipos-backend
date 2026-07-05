import { pool, withTransaction } from '../config/db.js'
import { applyStockDelta } from './stockModel.js'
import { findOrCreateCustomer } from './customerModel.js'

const CREDIT_CLOSE_MODES = ['Cash', 'Card', 'UPI']

export async function createSale({ items, discountPercent, customerMobile, customerName, customerAddress, paymentMode }) {
  if (!items || items.length === 0) {
    const err = new Error('A bill needs at least one item')
    err.status = 400
    throw err
  }

  return withTransaction(async (client) => {
    let subtotal = 0
    let gstAmount = 0
    const lines = []

    for (const item of items) {
      const lineSubtotal = item.price * item.qty
      const lineGst = (lineSubtotal * (item.gst || 0)) / 100
      subtotal += lineSubtotal
      gstAmount += lineGst
      lines.push({
        productId: item.id,
        name: item.name,
        price: item.price,
        gst: item.gst || 0,
        qty: item.qty,
        lineTotal: lineSubtotal + lineGst,
      })
    }

    const discountAmount = (subtotal * (discountPercent || 0)) / 100
    const total = subtotal + gstAmount - discountAmount
    const mode = paymentMode || 'Cash'
    const creditStatus = mode === 'Credit' ? 'pending' : 'none'

    const customerId = await findOrCreateCustomer(
      { mobile: customerMobile, name: customerName, address: customerAddress },
      client
    )

    const { rows } = await client.query(
      `INSERT INTO sales (customer_id, customer_mobile, customer_name, discount_percent, subtotal, gst_amount, discount_amount, total, payment_mode, credit_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, created_at`,
      [customerId, customerMobile || null, customerName || null, discountPercent || 0, subtotal, gstAmount, discountAmount, total, mode, creditStatus]
    )
    const saleId = rows[0].id
    const billNo = `BILL-${3000 + saleId}`
    await client.query('UPDATE sales SET bill_no = $1 WHERE id = $2', [billNo, saleId])

    for (const line of lines) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, price, gst, quantity, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [saleId, line.productId, line.name, line.price, line.gst, line.qty, line.lineTotal]
      )
      await applyStockDelta(line.productId, -line.qty, `Sale ${billNo}`, client)
    }

    return {
      id: billNo,
      createdAt: rows[0].created_at,
      items,
      paymentMode: mode,
      creditStatus,
      customerMobile,
      customerName,
      discountPercent: discountPercent || 0,
      totals: {
        subtotal: round2(subtotal),
        gstAmount: round2(gstAmount),
        discountAmount: round2(discountAmount),
        total: round2(total),
        itemCount: items.reduce((s, i) => s + i.qty, 0),
      },
    }
  })
}

// History screen: search + filter bills by date range and free text
// (bill number or customer mobile/name), paginated.
export async function getBillHistory({ from, to, q, page = 1, limit = 25 }) {
  const conditions = []
  const params = []

  if (from) {
    params.push(from)
    conditions.push(`created_at >= $${params.length}`)
  }
  if (to) {
    params.push(to)
    conditions.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`)
  }
  if (q) {
    params.push(`%${q}%`)
    const idx = params.length
    conditions.push(`(bill_no ILIKE $${idx} OR customer_mobile ILIKE $${idx} OR customer_name ILIKE $${idx})`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (Math.max(page, 1) - 1) * limit

  const { rows } = await pool.query(
    `SELECT s.bill_no AS id, s.customer_name, s.customer_mobile, s.payment_mode,
            s.credit_status, s.total, s.created_at,
            COALESCE(SUM(si.quantity), 0)::int AS items
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     ${where}
     GROUP BY s.id
     ORDER BY s.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM sales s ${where}`,
    params
  )

  return {
    bills: rows.map((r) => ({ ...r, total: Number(r.total) })),
    total: countRows[0].count,
    page: Math.max(page, 1),
    limit,
  }
}

export async function getBillByNo(billNo) {
  const { rows: saleRows } = await pool.query(
    `SELECT bill_no AS id, customer_name, customer_mobile, payment_mode,
            credit_status, credit_closed_mode, credit_closed_at,
            discount_percent, subtotal, gst_amount, discount_amount, total, created_at
     FROM sales WHERE bill_no = $1`,
    [billNo]
  )
  const sale = saleRows[0]
  if (!sale) {
    const err = new Error('Bill not found')
    err.status = 404
    throw err
  }

  const { rows: items } = await pool.query(
    `SELECT product_name AS name, price, gst, quantity AS qty, line_total AS "lineTotal"
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.bill_no = $1
     ORDER BY si.id ASC`,
    [billNo]
  )

  return {
    ...sale,
    subtotal: Number(sale.subtotal),
    gstAmount: Number(sale.gst_amount),
    discountAmount: Number(sale.discount_amount),
    total: Number(sale.total),
    items: items.map((i) => ({ ...i, price: Number(i.price), gst: Number(i.gst), lineTotal: Number(i.lineTotal) })),
  }
}

// Deletes a bill and restores the stock it had deducted, keeping the
// stock ledger accurate (mirrors how a sale deducts stock on creation).
export async function deleteBill(billNo) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM sales WHERE bill_no = $1', [billNo])
    if (!rows[0]) {
      const err = new Error('Bill not found')
      err.status = 404
      throw err
    }
    const saleId = rows[0].id

    const { rows: items } = await client.query(
      'SELECT product_id, quantity FROM sale_items WHERE sale_id = $1 AND product_id IS NOT NULL',
      [saleId]
    )
    for (const item of items) {
      await applyStockDelta(item.product_id, item.quantity, `Bill ${billNo} deleted`, client)
    }

    await client.query('DELETE FROM sales WHERE id = $1', [saleId])
    return { id: billNo, deleted: true }
  })
}

export async function getRecentSales(limit = 5) {
  const { rows } = await pool.query(
    `SELECT s.bill_no AS id,
            to_char(s.created_at, 'HH12:MI AM') AS time,
            COALESCE(SUM(si.quantity), 0)::int AS items,
            s.total,
            s.payment_mode AS mode
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     GROUP BY s.id
     ORDER BY s.created_at DESC
     LIMIT $1`,
    [limit]
  )
  return rows.map((r) => ({ ...r, total: Number(r.total) }))
}

export async function getDashboardStats() {
  const { rows: salesRows } = await pool.query(
    `SELECT
       COALESCE(SUM(total) FILTER (WHERE created_at::date = CURRENT_DATE), 0) AS today_sales,
       COALESCE(SUM(total) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', now())), 0) AS monthly_sales,
       COALESCE(SUM(total), 0) AS total_revenue,
       COUNT(*)::int AS total_orders
     FROM sales`
  )
  const { rows: productRows } = await pool.query('SELECT COUNT(*)::int AS total_products FROM products')

  return {
    todaySales: Number(salesRows[0].today_sales),
    monthlySales: Number(salesRows[0].monthly_sales),
    totalOrders: salesRows[0].total_orders,
    totalProducts: productRows[0].total_products,
    totalRevenue: Number(salesRows[0].total_revenue),
  }
}

export async function getSalesTrend() {
  const { rows } = await pool.query(
    `SELECT to_char(d, 'Dy') AS day, COALESCE(SUM(s.total), 0) AS sales
     FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d
     LEFT JOIN sales s ON s.created_at::date = d::date
     GROUP BY d
     ORDER BY d ASC`
  )
  return rows.map((r) => ({ day: r.day.trim(), sales: Number(r.sales) }))
}

export async function getBestSellers(limit = 4) {
  const { rows } = await pool.query(
    `SELECT product_name AS name, SUM(quantity)::int AS units, SUM(line_total) AS revenue
     FROM sale_items
     GROUP BY product_name
     ORDER BY units DESC
     LIMIT $1`,
    [limit]
  )
  return rows.map((r) => ({ ...r, revenue: Number(r.revenue) }))
}

// Credit Bills screen: list pending and paid credit sales, optionally
// filtered by status ('pending' | 'paid'). Ordinary Cash/Card/UPI bills
// carry credit_status = 'none' and are always excluded.
export async function getCreditBills(status) {
  const { rows } = await pool.query(
    `SELECT bill_no AS id, customer_name, customer_mobile, total,
            credit_status, credit_closed_mode, credit_closed_at, created_at
     FROM sales
     WHERE credit_status <> 'none'
       AND ($1::text IS NULL OR credit_status = $1)
     ORDER BY created_at DESC`,
    [status || null]
  )
  return rows.map((r) => ({ ...r, total: Number(r.total) }))
}

// Closes a pending credit bill by recording which real payment method the
// customer ultimately paid with. Does not touch stock — the sale already
// moved inventory when it was created.
export async function closeCreditBill(billNo, closedMode) {
  if (!CREDIT_CLOSE_MODES.includes(closedMode)) {
    const err = new Error(`closedMode must be one of ${CREDIT_CLOSE_MODES.join(', ')}`)
    err.status = 400
    throw err
  }

  const { rows } = await pool.query(
    `UPDATE sales
     SET credit_status = 'paid', credit_closed_mode = $1, credit_closed_at = now()
     WHERE bill_no = $2 AND credit_status = 'pending'
     RETURNING bill_no AS id, credit_status, credit_closed_mode, credit_closed_at`,
    [closedMode, billNo]
  )
  if (!rows[0]) {
    const err = new Error('Credit bill not found or already closed')
    err.status = 404
    throw err
  }
  return rows[0]
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}
