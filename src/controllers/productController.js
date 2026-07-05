import { asyncHandler } from '../utils/asyncHandler.js'
import * as Products from '../models/productModel.js'

export const listProducts = asyncHandler(async (req, res) => {
  res.json(await Products.getAllProducts())
})

export const listCategories = asyncHandler(async (req, res) => {
  res.json(await Products.getCategories())
})

export const addProduct = asyncHandler(async (req, res) => {
  res.status(201).json(await Products.createProduct(req.body))
})

export const editProduct = asyncHandler(async (req, res) => {
  const updated = await Products.updateProduct(req.params.id, req.body)
  if (!updated) return res.status(404).json({ error: 'Product not found' })
  res.json(updated)
})

export const removeProduct = asyncHandler(async (req, res) => {
  await Products.deleteProduct(req.params.id)
  res.status(204).end()
})
