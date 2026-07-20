// Validates the base64 data URL for an uploaded purchase-bill image before
// it's persisted. Mirrors the size/type rules from the spec: JPG/JPEG/PNG/
// WEBP only, 5 MB max — checked here too (not just in the browser) so a
// modified client or direct API call can't bypass the limit.
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

const DATA_URL_RE = /^data:([^;]+);base64,(.+)$/

export function validateBillImage(dataUrl) {
  if (dataUrl === null || dataUrl === undefined || dataUrl === '') return null

  const match = DATA_URL_RE.exec(dataUrl)
  if (!match) {
    const err = new Error('Bill image must be a valid image file (JPG, PNG, or WEBP).')
    err.status = 400
    throw err
  }

  const [, mimeType, base64Data] = match
  if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    const err = new Error('Unsupported file type. Please upload a JPG, PNG, or WEBP image.')
    err.status = 400
    throw err
  }

  // Decoded byte size from base64 length, without actually allocating a buffer.
  const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0
  const byteLength = (base64Data.length * 3) / 4 - padding
  if (byteLength > MAX_BYTES) {
    const err = new Error('Bill image exceeds the 5 MB size limit.')
    err.status = 400
    throw err
  }

  return dataUrl
}
