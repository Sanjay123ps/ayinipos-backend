import { asyncHandler } from '../utils/asyncHandler.js'
import { applyStockDelta, getStockHistory } from '../models/stockModel.js'

export const adjustStock = asyncHandler(async (req, res) => {
  const { delta, reason } = req.body
  if (typeof delta !== 'number' || delta === 0) {
    return res.status(400).json({ error: 'delta must be a non-zero number' })
  }
  const stock = await applyStockDelta(req.params.id, delta, reason || 'Manual adjustment')
  res.json({ id: Number(req.params.id), stock })
})

export const stockHistory = asyncHandler(async (req, res) => {
  res.json(await getStockHistory(req.params.id))
})
