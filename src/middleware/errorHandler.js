export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` })
}

export function errorHandler(err, req, res, next) {
  console.error(err)
  const status = err.status || 500
  res.status(status).json({
    error: err.message || 'Something went wrong',
  })
}
