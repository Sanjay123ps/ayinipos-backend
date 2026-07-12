import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { login, changePassword } from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// A few attempts per minute per IP is plenty for shop-staff logging in on a
// handful of devices, and shuts down unlimited password guessing.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a minute and try again.' },
})

router.post('/login', loginLimiter, login)
router.post('/change-password', requireAuth, changePassword)
export default router
