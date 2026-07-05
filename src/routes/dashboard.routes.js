import { Router } from 'express'
import { dashboardStats, salesTrend, bestSellers, recentSales } from '../controllers/dashboardController.js'

const router = Router()
router.get('/summary', dashboardStats)
router.get('/sales-trend', salesTrend)
router.get('/best-sellers', bestSellers)
router.get('/recent-sales', recentSales)
export default router
