import { Router } from 'express'
import {
  listPurchases,
  listSuppliers,
  addPurchase,
  getPurchase,
  editPurchase,
  removePurchase,
  exportPurchases,
} from '../controllers/purchaseController.js'

const router = Router()

// Static/prefixed paths before the `:billNo` param route.
router.get('/export', exportPurchases)
router.get('/suppliers', listSuppliers)

router.get('/', listPurchases)
router.post('/', addPurchase)
router.get('/:billNo', getPurchase)
router.put('/:billNo', editPurchase)
router.delete('/:billNo', removePurchase)

export default router
