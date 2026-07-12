import dotenv from 'dotenv'
dotenv.config()

import { getJwtSecret } from './config/jwt.js'
getJwtSecret() // fail fast on boot if JWT_SECRET is missing/placeholder — see config/jwt.js

import app from './app.js'

const PORT = process.env.PORT || 4000

app.listen(PORT, () => {
  console.log(`🌿 Ayini POS API listening on port ${PORT}`)
})
