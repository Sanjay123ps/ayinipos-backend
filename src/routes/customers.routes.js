import { Router } from 'express'
import { listCustomers, searchCustomers, updateCustomer } from '../controllers/customerController.js'

const router = Router()
router.get('/', listCustomers)
router.get('/search', searchCustomers)
router.put('/:id', updateCustomer)
export default router
