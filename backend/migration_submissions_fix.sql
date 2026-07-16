-- migration_submissions_fix.sql
-- Add missing telemetry columns to Submissions and TestSubmissions tables

ALTER TABLE Submissions ADD COLUMN IF NOT EXISTS dwell_seconds JSONB;
ALTER TABLE Submissions ADD COLUMN IF NOT EXISTS max_scroll_depth_percent INT;

ALTER TABLE TestSubmissions ADD COLUMN IF NOT EXISTS dwell_seconds JSONB;
ALTER TABLE TestSubmissions ADD COLUMN IF NOT EXISTS max_scroll_depth_percent INT;
