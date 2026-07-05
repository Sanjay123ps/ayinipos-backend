import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { asyncHandler } from '../utils/asyncHandler.js'
import { findUserByUsername, findUserById, updateUserPassword } from '../models/userModel.js'

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }

  const user = await findUserByUsername(username)
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' })
  }

  const matches = await bcrypt.compare(password, user.password_hash)
  if (!matches) {
    return res.status(401).json({ error: 'Invalid username or password' })
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: '12h' }
  )

  res.json({ token, user: { name: user.username, username: user.username, role: user.role } })
})

// POST /auth/change-password  { currentPassword, newPassword }  (requires auth)
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' })
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' })
  }

  const user = await findUserById(req.user.sub)
  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }

  const matches = await bcrypt.compare(currentPassword, user.password_hash)
  if (!matches) {
    return res.status(401).json({ error: 'Current password is incorrect' })
  }

  const newHash = await bcrypt.hash(newPassword, 10)
  await updateUserPassword(user.id, newHash)

  res.json({ success: true })
})
