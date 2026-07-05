import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

// Railway / most managed Postgres providers need SSL but use a
// self-signed cert chain, so we disable strict verification in production.
// DATABASE_URL is provided automatically by Railway's Postgres plugin.
export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'ayini_pos',
      }
)

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err)
})

export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
