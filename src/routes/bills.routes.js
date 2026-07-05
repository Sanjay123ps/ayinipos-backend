import { Router } from 'express'
import {
  createBill,
  listBills,
  getBill,
  removeBill,
  exportBills,
  listCreditBills,
  closeCreditBill,
} from '../controllers/billingController.js'

const router = Router()

// Static/prefixed paths must come before the `:billNo` param route below,
// otherwise Express would try to match "export" or "credit" as a bill number.
router.get('/export', exportBills)
router.get('/credit', listCreditBills)
router.patch('/credit/:billNo/close', closeCreditBill)

router.get('/', listBills)
router.post('/', createBill)
router.get('/:billNo', getBill)
router.delete('/:billNo', removeBill)

export default router
