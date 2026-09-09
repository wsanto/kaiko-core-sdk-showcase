import {
  pgTable,
  uuid,
  varchar,
  decimal,
  timestamp,
  jsonb,
  index,
  integer,
  real,
  text,
} from "drizzle-orm/pg-core";

/**
 * Emotion Trajectory Table
 *
 * Tracks emotional changes over time for trajectory analysis and pattern detection.
 * Used by TrajectoryService to calculate baselines, detect trends, and identify patterns.
 *
 * Related to Phase 2.1: Trajectory Tracking Service
 * Phase 3.2: Added memory graduation fields (tier, importance metrics)
 * Phase 6.1: Added emotional signature fields (vector, tags, signature hash)
 */
export const emotionTrajectory = pgTable(
  "emotion_trajectory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    contextId: uuid("context_id"), // References conversation_context(id) if context-based
    externalId: varchar("external_id", { length: 255 }), // External message ID
    timestamp: timestamp("timestamp", { withTimezone: true, mode: "date" }).notNull().defaultNow(),

    // Core emotion metrics (from EQ Analysis)
    dominantEmotion: varchar("dominant_emotion", { length: 50 }).notNull(),
    intensity: decimal("intensity", { precision: 3, scale: 2 }).notNull(),
    valence: decimal("valence", { precision: 3, scale: 2 }).notNull(),
    arousal: decimal("arousal", { precision: 3, scale: 2 }).notNull(),
    complexity: varchar("complexity", { length: 20 }).notNull(), // simple, layered, paradoxical, transcendent
    wonderIndex: decimal("wonder_index", { precision: 3, scale: 2 }).notNull(),
    discoveryLevel: varchar("discovery_level", { length: 20 }).notNull(), // routine, normal, significant, breakthrough, transcendent

    // Raw emotion scores (JSONB for flexibility)
    rawEmotions: jsonb("raw_emotions").notNull(),

    // Phase 3.2: Memory Graduation System
    memoryTier: varchar("memory_tier", { length: 20 }).notNull().default("ephemeral"), // ephemeral, session, important, core
    accessCount: integer("access_count").notNull().default(0), // Number of times accessed/referenced
    connectionCount: integer("connection_count").notNull().default(0), // Number of connections to other memories
    significanceScore: decimal("significance_score", { precision: 3, scale: 2 }).notNull().default("0.0"), // 0.0-1.0
    importanceScore: decimal("importance_score", { precision: 3, scale: 2 }).notNull().default("0.0"), // Calculated importance
    lastAccessed: timestamp("last_accessed", { withTimezone: true, mode: "date" }), // Last time memory was accessed
    graduatedAt: timestamp("graduated_at", { withTimezone: true, mode: "date" }), // When tier was last upgraded

    // Phase 6.1: Emotional Signature & Vector Search
    emotionalVector: real("emotional_vector").array(), // 9-dimensional normalized vector for similarity search
    emotionalTags: text("emotional_tags").array(), // Array of emotional tags (joy, breakthrough, growth, etc.)
    emotionalSignature: text("emotional_signature"), // Unique hash identifier for this signature

    // Additional metadata (patterns, triggers, etc.)
    metadata: jsonb("metadata"),
  },
  (table) => ({
    // Index for time-series queries by user
    userTimeIdx: index("idx_emotion_trajectory_user_time").on(
      table.userId,
      table.timestamp.desc()
    ),
    // Index for context-based queries
    contextIdx: index("idx_emotion_trajectory_context").on(table.contextId),
    // Index for pattern detection queries
    emotionTimeIdx: index("idx_emotion_trajectory_emotion_time").on(
      table.dominantEmotion,
      table.timestamp.desc()
    ),
    // Phase 3.2: Index for memory graduation queries
    memoryTierIdx: index("idx_emotion_trajectory_memory_tier").on(
      table.userId,
      table.memoryTier,
      table.importanceScore.desc()
    ),
    // Phase 6.1: Indexes for emotional signature search (created in migration)
    // idx_emotional_vector, idx_emotional_tags, idx_emotional_signature
  })
);

/**
 * Type inference for Drizzle ORM
 */
export type EmotionTrajectory = typeof emotionTrajectory.$inferSelect;
export type InsertEmotionTrajectory = typeof emotionTrajectory.$inferInsert;
