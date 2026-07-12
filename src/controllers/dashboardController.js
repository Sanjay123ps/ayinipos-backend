import { asyncHandler } from '../utils/asyncHandler.js'
import * as Sales from '../models/saleModel.js'

export const dashboardStats = asyncHandler(async (req, res) => {
  const { from, to } = req.query
  res.json(await Sales.getDashboardStats({ from, to }))
})

export const salesTrend = asyncHandler(async (req, res) => {
  const { from, to } = req.query
  res.json(await Sales.getSalesTrend({ from, to }))
})

export const bestSellers = asyncHandler(async (req, res) => {
  const { from, to, limit } = req.query
  res.json(await Sales.getBestSellers({ from, to, limit: limit ? Number(limit) : 4 }))
})

export const recentSales = asyncHandler(async (req, res) => {
  res.json(await Sales.getRecentSales())
})
