-- schema.sql
-- Relational DDL for Live Classroom Platform v2 matching Supabase PostgreSQL target.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS Users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    roll_number VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    session_token VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Classrooms Table
CREATE TABLE IF NOT EXISTS Classrooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    classroom_id VARCHAR(50) UNIQUE NOT NULL, -- short join code e.g. REACT60
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'pending_test', 'locked')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. UserClassrooms Table (Join Table for many-to-many relationship)
CREATE TABLE IF NOT EXISTS UserClassrooms (
    user_id UUID REFERENCES Users(id) ON DELETE CASCADE,
    classroom_id UUID REFERENCES Classrooms(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, classroom_id)
);

-- 4. OTPRequests Table
CREATE TABLE IF NOT EXISTS OTPRequests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempt_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Notes Table
CREATE TABLE IF NOT EXISTS Notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    classroom_id UUID REFERENCES Classrooms(id) ON DELETE CASCADE,
    topic_number INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    markdown_content TEXT NOT NULL,
    headings_manifest JSONB,
    UNIQUE (classroom_id, topic_number)
);

-- 6. Questions Table
CREATE TABLE IF NOT EXISTS Questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    classroom_id UUID REFERENCES Classrooms(id) ON DELETE CASCADE,
    topic_number INT NOT NULL,
    code_task_prompt TEXT NOT NULL,
    reasoning_prompt TEXT NOT NULL,
    reasoning_type VARCHAR(50) CHECK (reasoning_type IN ('typed', 'mcq', 'multi_select')),
    options JSONB, -- list of strings for mcq/multi_select choices
    UNIQUE (classroom_id, topic_number)
);

-- 7. Submissions Table
CREATE TABLE IF NOT EXISTS Submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES Users(id) ON DELETE CASCADE,
    classroom_id UUID REFERENCES Classrooms(id) ON DELETE CASCADE,
    question_id UUID REFERENCES Questions(id) ON DELETE CASCADE,
    code TEXT,
    code_output TEXT,
    reasoning_answer TEXT,
    time_taken_seconds INT,
    tab_switch_count INT DEFAULT 0,
    headings_reached JSONB, -- list of integers e.g. [1, 2]
    was_empty BOOLEAN DEFAULT FALSE,
    notes_telemetry JSONB,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. MishapLogs Table
CREATE TABLE IF NOT EXISTS MishapLogs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES Users(id) ON DELETE CASCADE,
    classroom_id UUID REFERENCES Classrooms(id) ON DELETE CASCADE,
    type VARCHAR(50) CHECK (type IN ('tab_switch', 'inactivity', 'paste_attempt')),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    meta JSONB
);

-- 9. Add live_session_active to Classrooms if not present
ALTER TABLE Classrooms ADD COLUMN IF NOT EXISTS live_session_active BOOLEAN DEFAULT FALSE;

-- 10. Tests Table
CREATE TABLE IF NOT EXISTS Tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    classroom_id UUID REFERENCES Classrooms(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    duration_minutes INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. TestSubmissions Table
CREATE TABLE IF NOT EXISTS TestSubmissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID REFERENCES Tests(id) ON DELETE CASCADE,
    student_id UUID REFERENCES Users(id) ON DELETE CASCADE,
    question_id UUID REFERENCES Questions(id) ON DELETE CASCADE,
    code TEXT,
    code_output TEXT,
    reasoning_answer TEXT,
    time_taken_seconds INT,
    tab_switch_count INT DEFAULT 0,
    notes_telemetry JSONB,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. StudentWorkspaces Table
CREATE TABLE IF NOT EXISTS StudentWorkspaces (
    student_id UUID REFERENCES Users(id) ON DELETE CASCADE,
    classroom_id UUID REFERENCES Classrooms(id) ON DELETE CASCADE,
    files JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id, classroom_id)
);

-- 13. Assignments Table
CREATE TABLE IF NOT EXISTS Assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    classroom_id UUID REFERENCES Classrooms(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    assigned_to JSONB,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
    open_at TIMESTAMP,
    close_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. AssignmentQuestions Table
CREATE TABLE IF NOT EXISTS AssignmentQuestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES Assignments(id) ON DELETE CASCADE,
    question_index INT NOT NULL,
    code_task_prompt TEXT NOT NULL,
    reasoning_prompt TEXT NOT NULL,
    reasoning_type VARCHAR(50) CHECK (reasoning_type IN ('typed', 'mcq', 'multi_select')),
    options JSONB,
    timer_seconds INT
);

-- 15. AssignmentSubmissions Table
CREATE TABLE IF NOT EXISTS AssignmentSubmissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID REFERENCES Assignments(id) ON DELETE CASCADE,
    question_id UUID REFERENCES AssignmentQuestions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES Users(id) ON DELETE CASCADE,
    code TEXT,
    code_output TEXT,
    reasoning_answer TEXT,
    time_taken_seconds INT,
    tab_switch_count INT DEFAULT 0,
    dwell_seconds JSONB,
    max_scroll_depth INT,
    notes_telemetry JSONB,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, question_id)
);
