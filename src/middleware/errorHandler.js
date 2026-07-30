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
  // TEMP DEBUG: always exposing the real message (even on 500 in prod) to
  // diagnose the delete-bill 500 without needing Render log access. Revert
  // this line back to `status < 500 || process.env.NODE_ENV !== 'production'`
  // once the cause is found.
  const exposeMessage = true

  res.status(status).json({
    error: exposeMessage ? err.message || 'Something went wrong' : 'Something went wrong. Please try again.',
  })
}
