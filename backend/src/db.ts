import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

// PostgreSQL is connected lazily by route handlers. This keeps Vercel's
// serverless function import-safe; /health can respond even before DB setup.
const pool = new Pool({
  ...(connectionString ? { connectionString } : {}),
  ...(connectionString?.includes('supabase') ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
  console.log('Connected to Supabase PostgreSQL successfully.');
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

export default pool;
