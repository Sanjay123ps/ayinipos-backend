import { asyncHandler } from '../utils/asyncHandler.js'
import * as Sales from '../models/saleModel.js'
import { sendCsv } from '../utils/csvExport.js'

export const createBill = asyncHandler(async (req, res) => {
  const bill = await Sales.createSale(req.body)
  res.status(201).json(bill)
})

// GET /bills?from=&to=&q=&page=&limit=  — History screen search/filter
export const listBills = asyncHandler(async (req, res) => {
  const { from, to, q, page, limit } = req.query
  res.json(
    await Sales.getBillHistory({
      from: from || null,
      to: to || null,
      q: q || null,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    })
  )
})

export const getBill = asyncHandler(async (req, res) => {
  res.json(await Sales.getBillByNo(req.params.billNo))
})

export const removeBill = asyncHandler(async (req, res) => {
  res.json(await Sales.deleteBill(req.params.billNo))
})

// GET /bills/export?from=&to=&q=  — History screen "Export"
export const exportBills = asyncHandler(async (req, res) => {
  const { from, to, q } = req.query
  const { bills } = await Sales.getBillHistory({
    from: from || null,
    to: to || null,
    q: q || null,
    page: 1,
    limit: 100000,
  })
  sendCsv(res, `bills-${Date.now()}.csv`, bills, [
    { key: 'id', label: 'Bill No' },
    { key: 'created_at', label: 'Date' },
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'customer_mobile', label: 'Customer Mobile' },
    { key: 'payment_mode', label: 'Payment Mode' },
    { key: 'credit_status', label: 'Credit Status' },
    { key: 'items', label: 'Items' },
    { key: 'total', label: 'Total' },
  ])
})

// GET /bills/credit?status=pending|paid  — Credit Bills screen
export const listCreditBills = asyncHandler(async (req, res) => {
  res.json(await Sales.getCreditBills(req.query.status || null))
})

// PATCH /bills/credit/:billNo/close  { closedMode: 'Cash' | 'Card' | 'UPI' }
export const closeCreditBill = asyncHandler(async (req, res) => {
  res.json(await Sales.closeCreditBill(req.params.billNo, req.body.closedMode))
})
