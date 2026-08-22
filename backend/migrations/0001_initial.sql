-- Cloudflare D1 Schema for Adaptive Handwriting Coach
-- Run with: wrangler d1 execute handwriting-db --file=./migrations/0001_initial.sql

-- ============================================================
-- Classrooms
-- ============================================================
CREATE TABLE IF NOT EXISTS classrooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    teacher_name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Students
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    classroom_id TEXT REFERENCES classrooms(id),
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Scans — uploaded worksheet images + AI analysis results
-- ============================================================
CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    image_url TEXT NOT NULL,
    image_r2_key TEXT,
    alignment INTEGER NOT NULL,
    spacing INTEGER NOT NULL,
    curves INTEGER NOT NULL,
    explanation_alignment TEXT NOT NULL,
    explanation_spacing TEXT NOT NULL,
    explanation_curves TEXT NOT NULL,
    teacher_confirmed INTEGER DEFAULT 0,
    is_fallback INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Exercises — pattern/tracing activities
-- ============================================================
CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    skill TEXT NOT NULL,               -- 'alignment', 'spacing', 'curves'
    exercise_type TEXT NOT NULL,       -- 'spiral', 'bug', 'wand', 'sentence', 'letter', 'shape'
    title TEXT NOT NULL,
    description TEXT,
    target_letter TEXT,
    target_word TEXT,
    difficulty_level INTEGER DEFAULT 1,
    template_data TEXT,                -- JSON for stroke paths, etc.
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Exercise Results — student tracing/game outcomes
-- ============================================================
CREATE TABLE IF NOT EXISTS exercise_results (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    scan_id TEXT REFERENCES scans(id),
    raw_points TEXT NOT NULL,          -- JSON array of {x, y, t, p}
    kinematics TEXT,                   -- JSON: movement_smoothness, pacing_consistency, etc.
    dtw_distance REAL,
    validation_status TEXT,            -- 'SUCCESS', 'ERROR'
    validation_reason TEXT,
    score INTEGER,                     -- 0-100 composite
    completed_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Worksheets — generated/predefined worksheet PDFs
-- ============================================================
CREATE TABLE IF NOT EXISTS worksheets (
    id TEXT PRIMARY KEY,
    skill TEXT NOT NULL,               -- 'alignment', 'spacing', 'curves'
    title TEXT NOT NULL,
    description TEXT,
    r2_key TEXT NOT NULL,
    url TEXT,
    is_template INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Teacher Overrides — manual score corrections
-- ============================================================
CREATE TABLE IF NOT EXISTS teacher_overrides (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL REFERENCES scans(id),
    teacher_id TEXT,
    alignment INTEGER,
    spacing INTEGER,
    curves INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Progress — aggregated per-student progress snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS progress (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    skill TEXT NOT NULL,               -- 'alignment', 'spacing', 'curves'
    score INTEGER NOT NULL,            -- latest or averaged score
    trend TEXT,                        -- 'improving', 'stable', 'declining'
    scan_count INTEGER DEFAULT 0,
    snapshot_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Reports — generated PDF reports
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    r2_key TEXT NOT NULL,
    url TEXT,
    report_type TEXT DEFAULT 'progress', -- 'progress', 'summary', 'detailed'
    period_start TEXT,
    period_end TEXT,
    generated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Seed demo data
-- ============================================================

INSERT INTO classrooms (id, name, teacher_name) VALUES
    ('c1', 'Demo Class 1', 'Ms. Johnson')
ON CONFLICT (id) DO NOTHING;

INSERT INTO students (id, name, classroom_id) VALUES
    ('s0', 'Aarav K.', 'c1'),
    ('s1', 'Sara M.', 'c1'),
    ('s2', 'Diya P.', 'c1'),
    ('s3', 'Kabir S.', 'c1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO exercises (id, skill, exercise_type, title, description, target_letter, target_word, difficulty_level, template_data) VALUES
    -- Alignment exercises (straight lines family)
    ('ex_align_1', 'alignment', 'spiral', 'Galaxy Spiral', 'Trace from center out — builds steady baseline control', NULL, NULL, 1, '{"type":"spiral","turns":3,"maxR":230}'),
    ('ex_align_2', 'alignment', 'letter', 'Letter E Practice', 'Practice vertical strokes on baseline', 'E', 'LINE', 1, '{"letters":["E","F","H","I","L","T"],"family":"lines"}'),
    ('ex_align_3', 'alignment', 'shape', 'Straight Line Drills', 'Large shape tracing for baseline stability', NULL, NULL, 1, '{"family":"lines","shapes":["vertical","horizontal"]}'),

    -- Spacing exercises (zigzag family)
    ('ex_space_1', 'spacing', 'bug', 'Laser Bug Chase', 'Follow moving target — improves letter spacing rhythm', NULL, NULL, 1, '{"type":"bug","duration":8}'),
    ('ex_space_2', 'spacing', 'letter', 'Letter A Practice', 'Practice diagonal strokes with even gaps', 'A', 'ZIGZAG', 1, '{"letters":["A","K","M","N","V","W","X","Z"],"family":"zigzag"}'),
    ('ex_space_3', 'spacing', 'shape', 'Zigzag Pattern Drills', 'Sharp turns for spacing control', NULL, NULL, 1, '{"family":"zigzag","shapes":["diagonal","sharp_turns"]}'),

    -- Curves exercises (counter-clockwise family)
    ('ex_curves_1', 'curves', 'wand', 'Magic Wand Memory', 'Trace rune from memory — builds curve smoothness', NULL, NULL, 1, '{"type":"wand","points":5}'),
    ('ex_curves_2', 'curves', 'letter', 'Letter O Practice', 'Practice smooth counter-clockwise curves', 'O', 'MOON', 1, '{"letters":["C","O","G","Q","S"],"family":"counter_clockwise"}'),
    ('ex_curves_3', 'curves', 'sentence', 'Hero''s Sentence', 'Trace HERO — full word curve practice', NULL, 'HERO', 2, '{"word":"HERO","letters":["H","E","R","O"]}'),

    -- Paper worksheet scan
    ('ex_paper_1', 'alignment', 'paper', 'Paper Worksheet Scan', 'Photo of paper worksheet for AI analysis', NULL, NULL, 1, '{"type":"paper"}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Indexes for common queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scans_student_id ON scans(student_id);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_results_student_id ON exercise_results(student_id);
CREATE INDEX IF NOT EXISTS idx_exercise_results_exercise_id ON exercise_results(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_results_completed_at ON exercise_results(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_worksheets_skill ON worksheets(skill);
CREATE INDEX IF NOT EXISTS idx_teacher_overrides_scan_id ON teacher_overrides(scan_id);
CREATE INDEX IF NOT EXISTS idx_reports_student_id ON reports(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_student_id ON progress(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_skill ON progress(skill);
