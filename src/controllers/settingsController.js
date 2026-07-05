import { asyncHandler } from '../utils/asyncHandler.js'
import * as Settings from '../models/settingsModel.js'

export const getSettings = asyncHandler(async (req, res) => {
  res.json(await Settings.getSettings())
})

export const updateSettings = asyncHandler(async (req, res) => {
  res.json(await Settings.updateSettings(req.body))
})
