-- migration_upsert_constraints.sql
-- Run ONCE on your Supabase database to enable the ON CONFLICT upsert in /api/submit
-- These are CREATE ... IF NOT EXISTS so it is safe to run multiple times.
--
-- WHY UNIQUE CONSTRAINTS INSTEAD OF TIME-BASED DEDUP:
-- A time-window check requires 2 round-trips (SELECT + INSERT) and has a TOCTOU race:
-- two concurrent requests can both pass the SELECT check before either INSERT completes.
-- A unique constraint + ON CONFLICT is atomic at the DB level — no race condition possible.

-- 1. Unique constraint for live classroom submissions:
--    A student can only have ONE canonical answer per question per classroom.
--    Re-submissions update (overwrite) the existing row via ON CONFLICT DO UPDATE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_student_question
  ON Submissions (student_id, question_id);

-- 2. Unique constraint for test submissions:
--    A student can only have ONE canonical answer per question per test instance.
--    Re-submissions update (overwrite) the existing row via ON CONFLICT DO UPDATE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_submissions_student_question_test
  ON TestSubmissions (student_id, question_id, test_id);

-- Verify constraints were created:
SELECT indexname, tablename FROM pg_indexes
WHERE indexname IN (
  'idx_submissions_student_question',
  'idx_test_submissions_student_question_test'
);
