-- Migration 002: Add Memory Graduation System
-- Phase 3.2: Memory Graduation
-- Adds fields for tracking memory importance and tier graduation

-- Add new columns for memory graduation
ALTER TABLE emotion_trajectory
ADD COLUMN IF NOT EXISTS external_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS memory_tier VARCHAR(20) NOT NULL DEFAULT 'ephemeral',
ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS connection_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS significance_score DECIMAL(3,2) NOT NULL DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS importance_score DECIMAL(3,2) NOT NULL DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMP WITH TIME ZONE;

-- Add comment to memory_tier column
COMMENT ON COLUMN emotion_trajectory.memory_tier IS 'Memory tier: ephemeral, session, important, core';

-- Add comment to access_count column
COMMENT ON COLUMN emotion_trajectory.access_count IS 'Number of times this memory has been accessed or referenced';

-- Add comment to connection_count column
COMMENT ON COLUMN emotion_trajectory.connection_count IS 'Number of connections to other memories';

-- Add comment to significance_score column
COMMENT ON COLUMN emotion_trajectory.significance_score IS 'Emotional significance score (0.0-1.0)';

-- Add comment to importance_score column
COMMENT ON COLUMN emotion_trajectory.importance_score IS 'Calculated importance score for graduation decisions';

-- Create index for memory tier queries
CREATE INDEX IF NOT EXISTS idx_emotion_trajectory_memory_tier
ON emotion_trajectory (user_id, memory_tier, importance_score DESC);

-- Create index for external_id lookups
CREATE INDEX IF NOT EXISTS idx_emotion_trajectory_external_id
ON emotion_trajectory (external_id) WHERE external_id IS NOT NULL;

-- Add check constraint for memory_tier values
ALTER TABLE emotion_trajectory
ADD CONSTRAINT chk_memory_tier
CHECK (memory_tier IN ('ephemeral', 'session', 'important', 'core'));

-- Add check constraint for significance_score range
ALTER TABLE emotion_trajectory
ADD CONSTRAINT chk_significance_score
CHECK (significance_score >= 0.0 AND significance_score <= 1.0);

-- Add check constraint for importance_score range
ALTER TABLE emotion_trajectory
ADD CONSTRAINT chk_importance_score
CHECK (importance_score >= 0.0 AND importance_score <= 1.0);

-- Create function to auto-update last_accessed timestamp
CREATE OR REPLACE FUNCTION update_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.access_count > OLD.access_count THEN
    NEW.last_accessed = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating last_accessed
DROP TRIGGER IF EXISTS tr_update_last_accessed ON emotion_trajectory;
CREATE TRIGGER tr_update_last_accessed
  BEFORE UPDATE ON emotion_trajectory
  FOR EACH ROW
  EXECUTE FUNCTION update_last_accessed();

-- Migration complete
SELECT 'Migration 002: Memory Graduation System applied successfully' AS status;
