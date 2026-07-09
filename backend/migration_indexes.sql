-- migration_indexes.sql
-- Run ONCE on your Supabase database to add index structures for foreign keys.
-- These index configurations optimize query routing, join processing speeds,
-- and aggregate calculations under concurrent user loads (e.g. 60+ students).

-- 1. Indexing Join Keys on Submissions Table
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON Submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_classroom_id ON Submissions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_submissions_question_id ON Submissions(question_id);

-- 2. Indexing Join Keys on MishapLogs Table
CREATE INDEX IF NOT EXISTS idx_mishaplogs_student_id ON MishapLogs(student_id);
CREATE INDEX IF NOT EXISTS idx_mishaplogs_classroom_id ON MishapLogs(classroom_id);

-- 3. Indexing Join Keys on TestSubmissions Table
CREATE INDEX IF NOT EXISTS idx_testsubmissions_student_id ON TestSubmissions(student_id);
CREATE INDEX IF NOT EXISTS idx_testsubmissions_question_id ON TestSubmissions(question_id);
CREATE INDEX IF NOT EXISTS idx_testsubmissions_test_id ON TestSubmissions(test_id);

-- 4. Indexing Join Keys on AssignmentSubmissions Table
CREATE INDEX IF NOT EXISTS idx_assignmentsubmissions_student_id ON AssignmentSubmissions(student_id);
CREATE INDEX IF NOT EXISTS idx_assignmentsubmissions_question_id ON AssignmentSubmissions(question_id);
CREATE INDEX IF NOT EXISTS idx_assignmentsubmissions_assignment_id ON AssignmentSubmissions(assignment_id);

-- 5. Indexing Join Keys on UserClassrooms Table
CREATE INDEX IF NOT EXISTS idx_userclassrooms_user_id ON UserClassrooms(user_id);
CREATE INDEX IF NOT EXISTS idx_userclassrooms_classroom_id ON UserClassrooms(classroom_id);

-- 6. Indexing Notes and Questions lookup columns
CREATE INDEX IF NOT EXISTS idx_notes_classroom_id ON Notes(classroom_id);
CREATE INDEX IF NOT EXISTS idx_questions_classroom_id ON Questions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_classroom_id ON Assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignmentquestions_assignment_id ON AssignmentQuestions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_tests_classroom_id ON Tests(classroom_id);
