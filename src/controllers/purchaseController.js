import { asyncHandler } from '../utils/asyncHandler.js'
import * as Purchases from '../models/purchaseModel.js'
import { getAllSuppliers } from '../models/supplierModel.js'
import { sendCsv } from '../utils/csvExport.js'

export const listPurchases = asyncHandler(async (req, res) => {
  const { page, limit } = req.query
  res.json(await Purchases.getAllPurchases({ page: page ? Number(page) : 1, limit: limit ? Number(limit) : 50 }))
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

// GET /purchases/export
export const exportPurchases = asyncHandler(async (req, res) => {
  const { limit } = req.query
  const rows = await Purchases.getAllPurchases({ page: 1, limit: limit ? Number(limit) : 100000 })
  sendCsv(res, `purchases-${Date.now()}.csv`, rows, [
    { key: 'id', label: 'Purchase No' },
    { key: 'date', label: 'Date' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'invoiceNo', label: 'Invoice No' },
    { key: 'items', label: 'Product Lines' },
    { key: 'totalQuantity', label: 'Total Quantity' },
  ])
})
