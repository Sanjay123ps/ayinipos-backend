import { asyncHandler } from '../utils/asyncHandler.js'
import * as Sessions from '../models/sessionModel.js'

export const listSessions = asyncHandler(async (req, res) => {
  res.json(await Sessions.getAllSessions())
})

export const addSession = asyncHandler(async (req, res) => {
  res.status(201).json(await Sessions.createSession(req.body))
})
