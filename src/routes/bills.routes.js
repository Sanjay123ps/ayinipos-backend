import { Router } from 'express'
import {
  createBill,
  listBills,
  getBill,
  removeBill,
  removeBills,
  exportBills,
  listCreditBills,
  closeCreditBill,
} from '../controllers/billingController.js'

const router = Router()

// Static/prefixed paths must come before the `:billNo` param route below,
// otherwise Express would try to match "export", "credit", or
// "bulk-delete" as a bill number.
router.get('/export', exportBills)
router.get('/credit', listCreditBills)
router.patch('/credit/:billNo/close', closeCreditBill)
router.post('/bulk-delete', removeBills)

router.get('/', listBills)
router.post('/', createBill)
router.get('/:billNo', getBill)
router.delete('/:billNo', removeBill)

export default router
