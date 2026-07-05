import { Router } from 'express'
import { listSessions, addSession } from '../controllers/sessionController.js'

const router = Router()
router.get('/', listSessions)
router.post('/', addSession)
export default router
