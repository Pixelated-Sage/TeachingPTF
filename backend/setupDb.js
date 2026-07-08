// backend/setupDb.js
// Setup Supabase PostgreSQL Database Tables.

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Live@ClassRoo@db.nxtoxurrmuezmcyeummc.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
});

async function setup() {
  try {
    console.log('Connecting to Supabase PostgreSQL database...');
    await client.connect();
    console.log('Connected successfully.');

    const sqlPath = path.join(__dirname, 'schema.sql');
    console.log(`Reading schema from ${sqlPath}...`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing DDL SQL queries to initialize tables...');
    await client.query(sql);
    console.log('Database tables successfully setup.');

  } catch (err) {
    console.error('Error setting up database tables:', err);
  } finally {
    await client.end();
  }
}

setup();
