import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

import authRoutes from './auth.routes.js'
import productRoutes from './products.routes.js'
import purchaseRoutes from './purchases.routes.js'
import billRoutes from './bills.routes.js'
import dashboardRoutes from './dashboard.routes.js'
import sessionRoutes from './sessions.routes.js'
import settingsRoutes from './settings.routes.js'
import customerRoutes from './customers.routes.js'

const router = Router()

// Public
router.use('/auth', authRoutes)

// Everything below requires a valid JWT (single admin role)
router.use('/products', requireAuth, productRoutes)
router.use('/purchases', requireAuth, purchaseRoutes)
router.use('/bills', requireAuth, billRoutes)
router.use('/dashboard', requireAuth, dashboardRoutes)
router.use('/sessions', requireAuth, sessionRoutes)
router.use('/settings', requireAuth, settingsRoutes)
router.use('/customers', requireAuth, customerRoutes)

export default router
