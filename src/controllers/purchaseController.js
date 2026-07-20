import { asyncHandler } from '../utils/asyncHandler.js'
import * as Purchases from '../models/purchaseModel.js'
import { getAllSuppliers } from '../models/supplierModel.js'
import { sendCsv } from '../utils/csvExport.js'

export const listPurchases = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = req.query
  res.json(
    await Purchases.getAllPurchases({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      from,
      to,
    })
  )
})

export const listSuppliers = asyncHandler(async (req, res) => {
  res.json(await getAllSuppliers())
})

export const addPurchase = asyncHandler(async (req, res) => {
  res.status(201).json(await Purchases.createPurchase(req.body))
})

export const getPurchase = asyncHandler(async (req, res) => {
  res.json(await Purchases.getPurchaseByNo(req.params.billNo))
})

export const editPurchase = asyncHandler(async (req, res) => {
  res.json(await Purchases.updatePurchase(req.params.billNo, req.body))
})

export const removePurchase = asyncHandler(async (req, res) => {
  res.json(await Purchases.deletePurchase(req.params.billNo))
})

// GET /purchases/export — one row per purchased product (catalog or
// manual), deliberately excluding the uploaded bill image.
export const exportPurchases = asyncHandler(async (req, res) => {
  const { from, to } = req.query
  const rows = await Purchases.getPurchaseExportRows({ from, to })
  sendCsv(res, `purchases-${Date.now()}.csv`, rows, [
    { key: 'billNo', label: 'Purchase Bill Number' },
    { key: 'purchaseDate', label: 'Purchase Date' },
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'productName', label: 'Product Name' },
    { key: 'productType', label: 'Product Type' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'purchasePrice', label: 'Purchase Price' },
    { key: 'lineTotal', label: 'Line Total' },
    { key: 'billTotal', label: 'Overall Bill Total' },
    { key: 'notes', label: 'Notes' },
  ])
})
