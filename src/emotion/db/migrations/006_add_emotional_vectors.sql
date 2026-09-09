-- Phase 6.1: Add emotional signature fields to emotion_trajectory table
-- Migration: 006_add_emotional_vectors
-- Date: 2025-11-20
-- Description: Adds vector-based emotional similarity search capabilities

-- Add emotional vector column (9 dimensions)
-- Vector dimensions: [valence_coord, arousal_coord, intensity, complexity, wonder, valence, arousal, discovery, tag_richness]
ALTER TABLE emotion_trajectory
ADD COLUMN IF NOT EXISTS emotional_vector float8[9];

-- Add emotional tags column
-- Stores array of emotional tags (joy, breakthrough, growth, etc.)
ALTER TABLE emotion_trajectory
ADD COLUMN IF NOT EXISTS emotional_tags text[];

-- Add emotional signature hash for quick lookups
-- Unique hash identifier for this emotional signature
ALTER TABLE emotion_trajectory
ADD COLUMN IF NOT EXISTS emotional_signature text;

-- Create indexes for vector and tag searches
-- GiST index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_emotional_vector
ON emotion_trajectory USING gin(emotional_vector);

-- GIN index for tag array searches
CREATE INDEX IF NOT EXISTS idx_emotional_tags
ON emotion_trajectory USING gin(emotional_tags);

-- B-tree index for signature hash lookups
CREATE INDEX IF NOT EXISTS idx_emotional_signature
ON emotion_trajectory(emotional_signature);

-- Composite index for user + vector searches
CREATE INDEX IF NOT EXISTS idx_user_emotional_vector
ON emotion_trajectory(user_id)
WHERE emotional_vector IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN emotion_trajectory.emotional_vector IS
'9-dimensional emotional vector for similarity search: [valence_coord, arousal_coord, intensity, complexity, wonder, valence, arousal, discovery, tag_richness]. Normalized to unit length.';

COMMENT ON COLUMN emotion_trajectory.emotional_tags IS
'Array of emotional tags (joy, breakthrough, growth, resilience, etc.) for semantic search and categorization.';

COMMENT ON COLUMN emotion_trajectory.emotional_signature IS
'Unique hash identifier for this emotional signature, generated from primary emotion, intensity, complexity, discovery level, and timestamp.';

-- Performance optimization: Analyze table after migration
ANALYZE emotion_trajectory;
