// backend/db.js
// Supabase PostgreSQL Connection Pool wrapper.

const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[DATABASE] FATAL ERROR: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
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
