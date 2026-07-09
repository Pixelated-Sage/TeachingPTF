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
  // Explicit pool sizing to prevent connection exhaustion on Supabase (max ~25 connections).
  // With 10 max connections per process, a single PM2 cluster of 2 instances uses at most 20
  // connections, leaving 5 for admin tooling and migrations.
  max: 10,
  idleTimeoutMillis: 30000,     // release idle connections after 30s
  connectionTimeoutMillis: 5000 // fail fast if pool is exhausted (5s timeout)
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
