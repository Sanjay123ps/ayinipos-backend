import { asyncHandler } from '../utils/asyncHandler.js'
import * as Customers from '../models/customerModel.js'

export const listCustomers = asyncHandler(async (req, res) => {
  res.json(await Customers.getAllCustomers())
})

// Powers the Billing screen's autofill: GET /customers/search?mobile=98
export const searchCustomers = asyncHandler(async (req, res) => {
  res.json(await Customers.searchCustomersByMobile(req.query.mobile))
})

export const updateCustomer = asyncHandler(async (req, res) => {
  res.json(await Customers.updateCustomer(req.params.id, req.body))
})
