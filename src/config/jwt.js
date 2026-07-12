// Single source of truth for the JWT signing secret. Both middleware/auth.js
// (verifying tokens) and controllers/authController.js (issuing tokens) call
// getJwtSecret() from here — neither reads process.env.JWT_SECRET directly.
//
// Previously each of those two files fell back to the hardcoded string
// 'dev-secret-change-me' whenever JWT_SECRET was unset. If that fallback (or
// the .env.example placeholder value) ever ended up live in production,
// anyone could forge a valid admin token by signing their own with that same
// known string — full account takeover, no password needed.
//
// The check below deliberately does NOT run at module top level. ES modules
// resolve a file's imports (recursively) before running any of that file's
// own inline statements — so if this file read process.env.JWT_SECRET as
// soon as it was imported, it would run before server.js's own
// `dotenv.config()` line ever executes, and throw even with a perfectly
// valid .env. Reading it lazily, inside this function, sidesteps that:
// server.js calls it explicitly right after dotenv.config() (see
// server.js) for a fail-fast startup check, and auth.js/authController.js
// call it again on every verify/sign.
const PLACEHOLDER = 'change-this-to-a-long-random-string'
const INSECURE_FALLBACK = 'dev-secret-change-me'

let cached = null

export function getJwtSecret() {
  if (cached) return cached

  const secret = process.env.JWT_SECRET
  if (!secret || secret === PLACEHOLDER || secret === INSECURE_FALLBACK) {
    throw new Error(
      'JWT_SECRET is missing or still set to a placeholder value. Generate a real ' +
        "secret (e.g. `node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"`) " +
        'and set it in your .env for local dev, or in Railway → Variables for production. ' +
        'The server will not start until this is a real, private value.'
    )
  }
  if (secret.length < 32) {
    throw new Error(
      `JWT_SECRET is only ${secret.length} characters — that's too short to be a real ` +
        'random secret. Generate a proper one (see the message above).'
    )
  }

  cached = secret
  return cached
}
