import { pgTable, text, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Emotion Patterns Table
 *
 * Stores detected emotional patterns (temporal, trigger-based, cyclical, sequential, recovery).
 * Used by PatternDetectionService to track recurring emotional patterns.
 *
 * Phase 6.2: Advanced Pattern Detection
 */
export const emotionPatterns = pgTable("emotion_patterns", {
  patternId: text("pattern_id").primaryKey(),
  userId: text("user_id").notNull(),
  patternType: text("pattern_type").notNull(), // temporal, trigger_based, cyclical, sequential, recovery
  patternName: text("pattern_name").notNull(),
  description: text("description").notNull(),
  trigger: text("trigger"),
  emotionalSequence: text("emotional_sequence").array().notNull(),
  frequency: integer("frequency").notNull().default(1),
  confidence: real("confidence").notNull(),
  firstDetected: timestamp("first_detected").notNull().defaultNow(),
  lastOccurrence: timestamp("last_occurrence").notNull(),
  typicalDuration: integer("typical_duration"), // Duration in minutes
  typicalIntensity: real("typical_intensity"), // Average intensity 0-1
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmotionPattern = typeof emotionPatterns.$inferSelect;
export type InsertEmotionPattern = typeof emotionPatterns.$inferInsert;
