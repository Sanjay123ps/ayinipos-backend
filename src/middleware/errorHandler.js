export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` })
}

export function errorHandler(err, req, res, next) {
  console.error(err)
  const status = err.status || 500

  // 4xx errors are thrown deliberately by application code (e.g. "Unknown
  // product 5") and are meant to be read by the client. A bare 500 is most
  // often something unexpected — a raw Postgres error, for instance — which
  // can include column/constraint names. In production those get replaced
  // with a generic message; the real error is still logged above either way.
  const exposeMessage = status < 500 || process.env.NODE_ENV !== 'production'

  res.status(status).json({
    error: exposeMessage ? err.message || 'Something went wrong' : 'Something went wrong. Please try again.',
  })
}
