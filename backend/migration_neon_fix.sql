-- migration_neon_fix.sql
-- Fixes missing columns and tables for Neon migration

-- 1. Add missing columns to Users table
ALTER TABLE Users ADD COLUMN IF NOT EXISTS session_token VARCHAR(255);
ALTER TABLE Users ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;

-- 2. Create Instructors table (was in Supabase, missing from schema.sql)
CREATE TABLE IF NOT EXISTS Instructors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    session_token VARCHAR(255),
    token_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Add index on session tokens for fast auth lookups
CREATE INDEX IF NOT EXISTS idx_users_session_token ON Users(session_token);
CREATE INDEX IF NOT EXISTS idx_instructors_session_token ON Instructors(session_token);
CREATE INDEX IF NOT EXISTS idx_instructors_email ON Instructors(email);

