import { pool, withTransaction } from '../config/db.js'
import { findOrCreateSupplier } from './supplierModel.js'
import { applyStockDelta } from './stockModel.js'

export async function getAllPurchases({ page = 1, limit = 50 } = {}) {
  const offset = (Math.max(page, 1) - 1) * limit
  const { rows } = await pool.query(
    `SELECT p.bill_no AS id, p.supplier_name AS supplier, p.invoice_no AS "invoiceNo",
            p.purchase_date AS date, COALESCE(SUM(pi.quantity), 0) AS "totalQuantity",
            COUNT(pi.id)::int AS items
     FROM purchases p
     LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  return rows.map((r) => ({
    ...r,
    totalQuantity: Number(r.totalQuantity),
  }))
}

export async function getPurchaseByNo(billNo) {
  const { rows: purchaseRows } = await pool.query(
    `SELECT bill_no AS id, supplier_name AS supplier, invoice_no AS "invoiceNo",
            purchase_date AS date, created_at AS "createdAt"
     FROM purchases WHERE bill_no = $1`,
    [billNo]
  )
  const purchase = purchaseRows[0]
  if (!purchase) {
    const err = new Error('Purchase not found')
    err.status = 404
    throw err
  }

  const { rows: items } = await pool.query(
    `SELECT pi.product_id AS "productId", pi.product_name AS "productName", pi.unit, pi.quantity
     FROM purchase_items pi
     JOIN purchases p ON p.id = pi.purchase_id
     WHERE p.bill_no = $1
     ORDER BY pi.id ASC`,
    [billNo]
  )

  return {
    ...purchase,
    items: items.map((i) => ({
      ...i,
      quantity: Number(i.quantity),
    })),
  }
}

// Builds the line list for a purchase bill. Purchases only ever move
// stock — there is no pricing/cost data collected or stored on the bill
// itself (see Purchase Module rules: purchase price is never asked for).
function buildLines(items) {
  if (!items || items.length === 0) {
    const err = new Error('A purchase bill needs at least one product')
    err.status = 400
    throw err
  }
  return items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    unit: item.unit || 'pcs',
    quantity: Number(item.quantity),
  }))
}

// Support multi-product purchase bills: one supplier/invoice, many product
// lines, each moving its own stock in the same transaction. Purchases only
// ever affect stock quantities — no pricing is read or written here.
export async function createPurchase({ supplier, invoiceNo, date, items }) {
  const lines = buildLines(items)

  return withTransaction(async (client) => {
    const supplierId = await findOrCreateSupplier(supplier, client)

    const { rows } = await client.query(
      `INSERT INTO purchases (supplier_id, supplier_name, invoice_no, purchase_date)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE))
       RETURNING id`,
      [supplierId, supplier, invoiceNo || null, date || null]
    )
    const purchaseId = rows[0].id
    const billNo = `PUR-${1000 + purchaseId}`
    await client.query('UPDATE purchases SET bill_no = $1 WHERE id = $2', [billNo, purchaseId])

    for (const line of lines) {
      // purchase_price/selling_price/gst_rate/line_total/amount are legacy
      // NOT NULL columns on this table; they're written as 0 since
      // purchases no longer carry any pricing information.
      await client.query(
        `INSERT INTO purchase_items (purchase_id, product_id, product_name, unit, quantity, purchase_price, selling_price, gst_rate, line_total, amount)
         VALUES ($1,$2,$3,$4,$5,0,0,0,0,0)`,
        [purchaseId, line.productId, line.productName, line.unit, line.quantity]
      )
      await applyStockDelta(line.productId, line.quantity, `Purchase ${billNo}`, client)
    }

    return { id: billNo, supplier, invoiceNo, date, items: lines.length }
  })
}

// Edits an existing multi-product purchase bill in place: reverses the
// stock effect of the old line items, then re-applies the new ones, all
// inside one transaction so inventory never drifts mid-edit.
export async function updatePurchase(billNo, { supplier, invoiceNo, date, items }) {
  const lines = buildLines(items)

  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM purchases WHERE bill_no = $1', [billNo])
    if (!rows[0]) {
      const err = new Error('Purchase not found')
      err.status = 404
      throw err
    }
    const purchaseId = rows[0].id

    const { rows: oldItems } = await client.query(
      'SELECT product_id, quantity FROM purchase_items WHERE purchase_id = $1',
      [purchaseId]
    )
    for (const item of oldItems) {
      await applyStockDelta(item.product_id, -Number(item.quantity), `Purchase ${billNo} edited`, client)
    }
    await client.query('DELETE FROM purchase_items WHERE purchase_id = $1', [purchaseId])

    const supplierId = await findOrCreateSupplier(supplier, client)
    await client.query(
      `UPDATE purchases
       SET supplier_id = $1, supplier_name = $2, invoice_no = $3, purchase_date = COALESCE($4, purchase_date)
       WHERE id = $5`,
      [supplierId, supplier, invoiceNo || null, date || null, purchaseId]
    )

    for (const line of lines) {
      await client.query(
        `INSERT INTO purchase_items (purchase_id, product_id, product_name, unit, quantity, purchase_price, selling_price, gst_rate, line_total, amount)
         VALUES ($1,$2,$3,$4,$5,0,0,0,0,0)`,
        [purchaseId, line.productId, line.productName, line.unit, line.quantity]
      )
      await applyStockDelta(line.productId, line.quantity, `Purchase ${billNo} edited`, client)
    }

    return { id: billNo, supplier, invoiceNo, date, items: lines.length }
  })
}

// Deletes a purchase bill and reverses the stock it had added, keeping the
// stock ledger accurate (mirrors saleModel.deleteBill).
export async function deletePurchase(billNo) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM purchases WHERE bill_no = $1', [billNo])
    if (!rows[0]) {
      const err = new Error('Purchase not found')
      err.status = 404
      throw err
    }
    const purchaseId = rows[0].id

    const { rows: items } = await client.query(
      'SELECT product_id, quantity FROM purchase_items WHERE purchase_id = $1',
      [purchaseId]
    )
    for (const item of items) {
      await applyStockDelta(item.product_id, -Number(item.quantity), `Purchase ${billNo} deleted`, client)
    }

    await client.query('DELETE FROM purchases WHERE id = $1', [purchaseId])
    return { id: billNo, deleted: true }
  })
}
