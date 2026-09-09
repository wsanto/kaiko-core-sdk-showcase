-- Rollback Phase 6.1: Remove emotional signature fields
-- Migration: 006_add_emotional_vectors (ROLLBACK)
-- Date: 2025-11-20
-- Description: Removes vector-based emotional similarity search capabilities

-- Drop indexes
DROP INDEX IF EXISTS idx_emotional_vector;
DROP INDEX IF EXISTS idx_emotional_tags;
DROP INDEX IF EXISTS idx_emotional_signature;
DROP INDEX IF EXISTS idx_user_emotional_vector;

-- Remove columns
ALTER TABLE emotion_trajectory
DROP COLUMN IF EXISTS emotional_vector,
DROP COLUMN IF EXISTS emotional_tags,
DROP COLUMN IF EXISTS emotional_signature;

-- Performance optimization: Analyze table after rollback
ANALYZE emotion_trajectory;
