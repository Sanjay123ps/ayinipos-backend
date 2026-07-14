import express from 'express'
import cors from 'cors'
import apiRouter from './routes/index.js'
import { notFound, errorHandler } from './middleware/errorHandler.js'

const app = express()

const corsOrigin = process.env.CORS_ORIGIN
app.use(
  cors({
    // '*' has to stay the literal string '*', not get wrapped in an array —
    // the cors package only treats a bare '*' string as "allow any origin".
    // Passing ['*'] makes it compare real Origin headers against the literal
    // string "*", which never matches, so every cross-origin request gets
    // silently blocked with no Access-Control-Allow-Origin header at all.
    origin: !corsOrigin || corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim()),
  })
)
app.use(express.json())

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api', apiRouter)

app.use(notFound)
app.use(errorHandler)

export default app