import { asyncHandler } from '../utils/asyncHandler.js'
import { applyStockDelta, getStockHistory } from '../models/stockModel.js'
import { getProductById } from '../models/productModel.js'

export const adjustStock = asyncHandler(async (req, res) => {
  const { delta, reason } = req.body
  if (typeof delta !== 'number' || delta === 0) {
    return res.status(400).json({ error: 'delta must be a non-zero number' })
  }
  const product = await getProductById(req.params.id)
  if (!product) {
    return res.status(404).json({ error: `Product ${req.params.id} not found` })
  }
  if (!product.trackStock) {
    return res.status(400).json({ error: 'This product does not track stock, so it cannot be adjusted' })
  }
  const stock = await applyStockDelta(req.params.id, delta, reason || 'Manual adjustment')
  res.json({ id: Number(req.params.id), stock })
})

export const stockHistory = asyncHandler(async (req, res) => {
  res.json(await getStockHistory(req.params.id))
})
