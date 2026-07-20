import { pool, withTransaction } from '../config/db.js'
import { findOrCreateSupplier } from './supplierModel.js'
import { applyStockDelta } from './stockModel.js'
import { validateBillImage } from '../utils/billImage.js'

export async function getAllPurchases({ page = 1, limit = 50, from, to } = {}) {
  const offset = (Math.max(page, 1) - 1) * limit
  const conditions = []
  const params = []

  if (from) {
    params.push(from)
    conditions.push(`p.purchase_date >= ($${params.length}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`)
  }
  if (to) {
    params.push(to)
    conditions.push(`p.purchase_date <= ($${params.length}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  params.push(limit, offset)
  const { rows } = await pool.query(
    `SELECT p.bill_no AS id, p.supplier_name AS supplier, p.invoice_no AS "invoiceNo",
            p.purchase_date AS date, p.notes, p.subtotal AS "totalAmount",
            COALESCE(SUM(pi.quantity), 0) AS "totalQuantity",
            COUNT(pi.id)::int AS items,
            (p.bill_image IS NOT NULL) AS "hasBillImage"
     FROM purchases p
     LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
     ${where}
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  return rows.map((r) => ({
    ...r,
    totalQuantity: Number(r.totalQuantity),
    totalAmount: Number(r.totalAmount),
  }))
}

export async function getPurchaseByNo(billNo) {
  const { rows: purchaseRows } = await pool.query(
    `SELECT bill_no AS id, supplier_name AS supplier, invoice_no AS "invoiceNo",
            purchase_date AS date, subtotal AS "totalAmount", notes,
            bill_image AS "billImage", created_at AS "createdAt"
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
    `SELECT pi.product_id AS "productId", pi.product_name AS "productName", pi.unit,
            pi.quantity, pi.purchase_price AS "purchasePrice", pi.line_total AS "lineTotal",
            pi.product_type AS "productType"
     FROM purchase_items pi
     JOIN purchases p ON p.id = pi.purchase_id
     WHERE p.bill_no = $1
     ORDER BY pi.id ASC`,
    [billNo]
  )

  return {
    ...purchase,
    totalAmount: Number(purchase.totalAmount),
    items: items.map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      purchasePrice: Number(i.purchasePrice),
      lineTotal: Number(i.lineTotal),
    })),
  }
}

function buildLines(items) {
  if (!items || items.length === 0) {
    const err = new Error('A purchase bill needs at least one product')
    err.status = 400
    throw err
  }
  return items.map((item, idx) => {
    const productName = (item.productName || '').trim()
    if (!productName) {
      const err = new Error(`Line ${idx + 1} needs a product name`)
      err.status = 400
      throw err
    }
    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      const err = new Error(`Line ${idx + 1} needs a valid quantity`)
      err.status = 400
      throw err
    }
    const purchasePrice = item.purchasePrice === undefined || item.purchasePrice === null || item.purchasePrice === ''
      ? 0
      : Number(item.purchasePrice)
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      const err = new Error(`Line ${idx + 1} needs a valid purchase price`)
      err.status = 400
      throw err
    }
    const productId = item.productId || null
    return {
      productId,
      productName,
      unit: item.unit || 'Nos',
      quantity,
      purchasePrice,
      lineTotal: Number((quantity * purchasePrice).toFixed(2)),
      productType: productId ? 'catalog' : 'manual',
    }
  })
}

async function insertLines(client, purchaseId, billNo, lines, reasonSuffix = '') {
  for (const line of lines) {
    await client.query(
      `INSERT INTO purchase_items
         (purchase_id, product_id, product_name, unit, quantity, purchase_price, selling_price, gst_rate, line_total, amount, product_type)
       VALUES ($1,$2,$3,$4,$5,$6,0,0,$7,$7,$8)`,
      [purchaseId, line.productId, line.productName, line.unit, line.quantity, line.purchasePrice, line.lineTotal, line.productType]
    )
    if (line.productId) {
      await applyStockDelta(line.productId, line.quantity, `Purchase ${billNo}${reasonSuffix}`, client)
    }
  }
}

export async function createPurchase({ supplier, invoiceNo, date, items, billImage, notes }) {
  const lines = buildLines(items)
  const subtotal = Number(lines.reduce((sum, l) => sum + l.lineTotal, 0).toFixed(2))
  const validatedImage = validateBillImage(billImage)

  return withTransaction(async (client) => {
    const supplierId = await findOrCreateSupplier(supplier, client)

    const { rows } = await client.query(
      `INSERT INTO purchases (supplier_id, supplier_name, invoice_no, purchase_date, subtotal, total_amount, bill_image, notes)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $5, $6, $7)
       RETURNING id`,
      [supplierId, supplier, invoiceNo || null, date || null, subtotal, validatedImage || null, notes || null]
    )
    const purchaseId = rows[0].id
    const billNo = `PUR-${1000 + purchaseId}`
    await client.query('UPDATE purchases SET bill_no = $1 WHERE id = $2', [billNo, purchaseId])

    await insertLines(client, purchaseId, billNo, lines)

    return { id: billNo, supplier, invoiceNo, date, items: lines.length, totalAmount: subtotal }
  })
}

export async function updatePurchase(billNo, { supplier, invoiceNo, date, items, billImage, notes }) {
  const lines = buildLines(items)
  const subtotal = Number(lines.reduce((sum, l) => sum + l.lineTotal, 0).toFixed(2))
  const imageProvided = billImage !== undefined
  const validatedImage = imageProvided ? validateBillImage(billImage) : undefined

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
      if (item.product_id) {
        await applyStockDelta(item.product_id, -Number(item.quantity), `Purchase ${billNo} edited`, client)
      }
    }
    await client.query('DELETE FROM purchase_items WHERE purchase_id = $1', [purchaseId])

    const supplierId = await findOrCreateSupplier(supplier, client)
    await client.query(
      `UPDATE purchases
       SET supplier_id = $1, supplier_name = $2, invoice_no = $3, purchase_date = COALESCE($4, purchase_date),
           subtotal = $5, total_amount = $5,
           bill_image = CASE WHEN $6 THEN $7 ELSE bill_image END,
           notes = COALESCE($8, notes)
       WHERE id = $9`,
      [supplierId, supplier, invoiceNo || null, date || null, subtotal, imageProvided, validatedImage || null, notes, purchaseId]
    )

    await insertLines(client, purchaseId, billNo, lines, ' edited')

    return { id: billNo, supplier, invoiceNo, date, items: lines.length, totalAmount: subtotal }
  })
}

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
      if (item.product_id) {
        await applyStockDelta(item.product_id, -Number(item.quantity), `Purchase ${billNo} deleted`, client)
      }
    }

    await client.query('DELETE FROM purchases WHERE id = $1', [purchaseId])
    return { id: billNo, deleted: true }
  })
}

export async function getPurchaseExportRows({ from, to } = {}) {
  const conditions = []
  const params = []
  if (from) {
    params.push(from)
    conditions.push(`p.purchase_date >= ($${params.length}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`)
  }
  if (to) {
    params.push(to)
    conditions.push(`p.purchase_date <= ($${params.length}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows } = await pool.query(
    `SELECT p.bill_no AS "billNo", p.purchase_date AS "purchaseDate", p.supplier_name AS "supplierName",
            pi.product_name AS "productName", pi.product_type AS "productType",
            pi.quantity, pi.unit, pi.purchase_price AS "purchasePrice", pi.line_total AS "lineTotal",
            p.subtotal AS "billTotal", p.notes
     FROM purchase_items pi
     JOIN purchases p ON p.id = pi.purchase_id
     ${where}
     ORDER BY p.created_at DESC, pi.id ASC`,
    params
  )
  return rows.map((r) => ({
    ...r,
    productType: r.productType === 'manual' ? 'Manual' : 'Catalog',
    quantity: Number(r.quantity),
    purchasePrice: Number(r.purchasePrice),
    lineTotal: Number(r.lineTotal),
    billTotal: Number(r.billTotal),
  }))
}
