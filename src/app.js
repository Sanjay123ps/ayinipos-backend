import express from 'express'
import cors from 'cors'
import apiRouter from './routes/index.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

const app = express()

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  })
)
app.use(express.json())

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api', apiRouter)

app.use(notFound)
app.use(errorHandler)

export default app
