// backend/db.js
// Neon PostgreSQL Connection Pool wrapper.

const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[DATABASE] FATAL ERROR: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }, // Required for Neon TLS connections
  // Neon uses a pooler by default; keep max connections reasonable.
  max: 10,
  idleTimeoutMillis: 30000,     // release idle connections after 30s
  connectionTimeoutMillis: 10000 // Neon can have cold starts, allow 10s
});

pool.on('connect', () => {
  console.log('[DATABASE] PostgreSQL pool client connected.');
});

pool.on('error', (err) => {
  console.error('[DATABASE] Unexpected database client error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
