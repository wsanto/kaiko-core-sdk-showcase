-- Phase 6.2: Create emotion_patterns table for pattern detection
-- Migration: 007_create_emotion_patterns
-- Date: 2025-11-20
-- Purpose: Store detected emotional patterns (temporal, trigger-based, cyclical, sequential, recovery)

-- Create emotion_patterns table
CREATE TABLE IF NOT EXISTS emotion_patterns (
  pattern_id text PRIMARY KEY,
  user_id text NOT NULL,
  pattern_type text NOT NULL,
  pattern_name text NOT NULL,
  description text NOT NULL,
  trigger text,
  emotional_sequence text[] NOT NULL,
  frequency integer NOT NULL DEFAULT 1,
  confidence float8 NOT NULL,
  first_detected timestamp NOT NULL DEFAULT now(),
  last_occurrence timestamp NOT NULL,
  typical_duration integer,           -- Duration in minutes
  typical_intensity float8,           -- Average intensity 0-1
  metadata jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Indexes for pattern queries
CREATE INDEX IF NOT EXISTS idx_patterns_user ON emotion_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON emotion_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON emotion_patterns(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_frequency ON emotion_patterns(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_last_occurrence ON emotion_patterns(last_occurrence DESC);

-- Comments for documentation
COMMENT ON TABLE emotion_patterns IS
'Stores detected emotional patterns (temporal, trigger-based, cyclical, sequential, recovery)';

COMMENT ON COLUMN emotion_patterns.pattern_id IS
'Unique identifier for the pattern (e.g., temporal-user123-Monday-Morning)';

COMMENT ON COLUMN emotion_patterns.pattern_type IS
'Pattern type: temporal, trigger_based, cyclical, sequential, recovery';

COMMENT ON COLUMN emotion_patterns.confidence IS
'Confidence score 0-1 based on frequency and consistency';

COMMENT ON COLUMN emotion_patterns.typical_duration IS
'Typical duration of this pattern in minutes';

COMMENT ON COLUMN emotion_patterns.typical_intensity IS
'Average intensity of emotions in this pattern (0-1)';

COMMENT ON COLUMN emotion_patterns.emotional_sequence IS
'Array of emotions in sequence (e.g., [joy, sadness, joy] for cyclical)';

-- Analyze table for query optimization
ANALYZE emotion_patterns;
