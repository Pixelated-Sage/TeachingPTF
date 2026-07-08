// backend/db.js
// Supabase PostgreSQL Connection Pool wrapper.

const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Live@ClassRoo@db.nxtoxurrmuezmcyeummc.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString,
});

pool.on('connect', () => {
  console.log('PostgreSQL database pool client connected.');
});

pool.on('error', (err) => {
  console.error('Unexpected database client error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
