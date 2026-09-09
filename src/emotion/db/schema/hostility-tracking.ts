import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Hostility Tracking Table (Phase 6.4)
 * Tracks hostility levels and escalation patterns for safety monitoring
 */
export const hostilityTracking = pgTable("hostility_tracking", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  contextId: text("context_id"),
  level: text("level").notNull(),              // none, low, medium, high
  score: text("score").notNull(),              // 0.0-1.0 as string
  escalationCount: integer("escalation_count").default(0),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  metadata: jsonb("metadata"),
});

export type HostilityTracking = typeof hostilityTracking.$inferSelect;
export type InsertHostilityTracking = typeof hostilityTracking.$inferInsert;
