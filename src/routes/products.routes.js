import { Router } from 'express'
import { listProducts, listCategories, addProduct, editProduct, removeProduct } from '../controllers/productController.js'
import { adjustStock, stockHistory } from '../controllers/inventoryController.js'

const router = Router()
router.get('/', listProducts)
router.get('/categories', listCategories)
router.post('/', addProduct)
router.put('/:id', editProduct)
router.delete('/:id', removeProduct)
router.patch('/:id/stock', adjustStock)
router.get('/:id/stock-history', stockHistory)
export default router
