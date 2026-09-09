-- Migration: Create emotion_trajectory table
-- Phase: 2.1 - Trajectory Tracking Service
-- Purpose: Track emotional changes over time for trajectory analysis and pattern detection

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create emotion_trajectory table
CREATE TABLE IF NOT EXISTS emotion_trajectory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(255) NOT NULL,
  context_id UUID, -- References conversation_context(id) if context-based
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Core emotion metrics (from EQ Analysis)
  dominant_emotion VARCHAR(50) NOT NULL,
  intensity DECIMAL(3,2) NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
  valence DECIMAL(3,2) NOT NULL CHECK (valence >= -1 AND valence <= 1),
  arousal DECIMAL(3,2) NOT NULL CHECK (arousal >= 0 AND arousal <= 1),
  complexity VARCHAR(20) NOT NULL CHECK (complexity IN ('simple', 'layered', 'paradoxical', 'transcendent')),
  wonder_index DECIMAL(3,2) NOT NULL CHECK (wonder_index >= 0 AND wonder_index <= 1),
  discovery_level VARCHAR(20) NOT NULL CHECK (discovery_level IN ('routine', 'normal', 'significant', 'breakthrough', 'transcendent')),

  -- Raw emotion scores (JSONB for flexibility)
  raw_emotions JSONB NOT NULL,

  -- Additional metadata (patterns, triggers, etc.)
  metadata JSONB
);

-- Create indexes for efficient queries

-- Index for time-series queries by user (most common query pattern)
CREATE INDEX idx_emotion_trajectory_user_time
  ON emotion_trajectory(user_id, timestamp DESC);

-- Index for context-based queries
CREATE INDEX idx_emotion_trajectory_context
  ON emotion_trajectory(context_id)
  WHERE context_id IS NOT NULL;

-- Index for pattern detection queries (by emotion type over time)
CREATE INDEX idx_emotion_trajectory_emotion_time
  ON emotion_trajectory(dominant_emotion, timestamp DESC);

-- Index for discovery-level queries (to find breakthroughs)
CREATE INDEX idx_emotion_trajectory_discovery
  ON emotion_trajectory(user_id, discovery_level, timestamp DESC)
  WHERE discovery_level IN ('breakthrough', 'transcendent');

-- Add comment to table
COMMENT ON TABLE emotion_trajectory IS 'Tracks emotional changes over time for trajectory analysis, pattern detection, and growth tracking (Phase 2.1)';

-- Add comments to key columns
COMMENT ON COLUMN emotion_trajectory.user_id IS 'User identifier for grouping emotional trajectory';
COMMENT ON COLUMN emotion_trajectory.context_id IS 'Optional reference to conversation context';
COMMENT ON COLUMN emotion_trajectory.dominant_emotion IS 'Primary emotion detected (joy, sadness, anger, etc.)';
COMMENT ON COLUMN emotion_trajectory.intensity IS 'Overall emotional strength (0.0-1.0)';
COMMENT ON COLUMN emotion_trajectory.valence IS 'Positive vs negative tone (-1.0 to +1.0)';
COMMENT ON COLUMN emotion_trajectory.arousal IS 'Energy level from calm to excited (0.0 to 1.0)';
COMMENT ON COLUMN emotion_trajectory.complexity IS 'Emotional complexity level';
COMMENT ON COLUMN emotion_trajectory.wonder_index IS 'Curiosity and openness score (0.0-1.0)';
COMMENT ON COLUMN emotion_trajectory.discovery_level IS 'Significance of emotional moment';
COMMENT ON COLUMN emotion_trajectory.raw_emotions IS 'Complete emotion scores in JSON format';
COMMENT ON COLUMN emotion_trajectory.metadata IS 'Additional data: patterns, triggers, analysis context';
