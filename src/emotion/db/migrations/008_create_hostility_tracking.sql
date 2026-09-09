-- Phase 6.4: Create hostility_tracking table
-- Tracks hostility levels and escalation patterns for safety monitoring

CREATE TABLE IF NOT EXISTS hostility_tracking (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL,
  context_id text,
  level text NOT NULL,              -- none, low, medium, high
  score text NOT NULL,              -- 0.0-1.0 as string
  escalation_count integer DEFAULT 0,
  detected_at timestamp NOT NULL DEFAULT now(),
  metadata jsonb
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_hostility_user ON hostility_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_hostility_time ON hostility_tracking(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_hostility_level ON hostility_tracking(level);

-- Comments
COMMENT ON TABLE hostility_tracking IS
'Tracks hostility levels and escalation patterns for safety monitoring';

COMMENT ON COLUMN hostility_tracking.level IS
'Hostility level: none, low, medium, high';

COMMENT ON COLUMN hostility_tracking.score IS
'Hostility score (0.0-1.0) stored as text';

COMMENT ON COLUMN hostility_tracking.escalation_count IS
'Number of consecutive hostile messages detected';

COMMENT ON COLUMN hostility_tracking.detected_at IS
'Timestamp when hostility was detected';
