import { Router } from 'express'
import { login, changePassword } from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.post('/login', login)
router.post('/change-password', requireAuth, changePassword)
export default router
