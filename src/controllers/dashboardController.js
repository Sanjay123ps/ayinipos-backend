import { asyncHandler } from '../utils/asyncHandler.js'
import * as Sales from '../models/saleModel.js'

export const dashboardStats = asyncHandler(async (req, res) => {
  res.json(await Sales.getDashboardStats())
})

export const salesTrend = asyncHandler(async (req, res) => {
  res.json(await Sales.getSalesTrend())
})

export const bestSellers = asyncHandler(async (req, res) => {
  res.json(await Sales.getBestSellers())
})

export const recentSales = asyncHandler(async (req, res) => {
  res.json(await Sales.getRecentSales())
})
