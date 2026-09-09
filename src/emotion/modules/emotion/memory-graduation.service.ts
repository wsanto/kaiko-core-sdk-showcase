import { injectable, inject } from "tsyringe";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, gte, sql } from "drizzle-orm";
import { Logger } from "winston";
import {
  emotionTrajectory,
  EmotionTrajectory,
} from "../../db";

/**
 * Memory Tier Enum
 * Defines the hierarchical importance levels for emotional memories
 */
export enum MemoryTier {
  EPHEMERAL = "ephemeral",   // Temporary working memory (1 session)
  SESSION = "session",       // Session-specific memories (1 conversation)
  IMPORTANT = "important",   // Cross-session memories with connections
  CORE = "core"              // Persistent, highly significant memories
}

/**
 * Graduation Thresholds
 * Criteria for promoting memories to higher tiers
 */
export interface GraduationThresholds {
  sessionToImportant: {
    connectionCount: number;    // OR condition
    accessCount: number;        // OR condition
    significanceScore: number;  // OR condition
  };
  importantToCore: {
    connectionCount: number;    // AND condition
    accessCount: number;        // AND condition
    significanceScore: number;  // AND condition
    ageInDays: number;         // AND condition
  };
}

/**
 * Memory Graduation Service
 *
 * Manages memory tier graduation and importance tracking.
 * Implements a hierarchical memory system: EPHEMERAL → SESSION → IMPORTANT → CORE
 *
 * Based on: anima_agentkit/memory/memory_hierarchy.py
 * Phase 3.2: Memory Graduation System
 */
@injectable()
export class MemoryGraduationService {
  // Default graduation thresholds (can be overridden)
  private readonly DEFAULT_THRESHOLDS: GraduationThresholds = {
    sessionToImportant: {
      connectionCount: 5,
      accessCount: 10,
      significanceScore: 0.7
    },
    importantToCore: {
      connectionCount: 15,
      accessCount: 30,
      significanceScore: 0.9,
      ageInDays: 7
    }
  };

  constructor(
    @inject("DB") private database: NodePgDatabase,
    @inject("LOGGER") private logger: Logger,
    private thresholds: GraduationThresholds = null as any
  ) {
    // Use default thresholds if not provided
    this.thresholds = thresholds || this.DEFAULT_THRESHOLDS;
  }

  /**
   * Calculate importance score for a memory
   *
   * Formula combines multiple factors:
   * - Significance score (40%): Emotional significance
   * - Connection weight (30%): Number of connections to other memories
   * - Access weight (20%): Frequency of access
   * - Recency weight (10%): How recently accessed
   *
   * @param memory - Emotion trajectory record
   * @returns Importance score (0.0-1.0)
   */
  calculateImportance(memory: EmotionTrajectory): number {
    const now = new Date();
    const lastAccessed = memory.lastAccessed || memory.timestamp;
    const daysSinceAccess = Math.max(
      0,
      (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate individual weights
    const recencyWeight = 1.0 / (1 + daysSinceAccess);
    const connectionWeight = Math.min(
      (memory.connectionCount || 0) / 10,
      1.0
    ); // Cap at 10 connections
    const accessWeight = Math.min((memory.accessCount || 0) / 20, 1.0); // Cap at 20 accesses
    const significanceScore = parseFloat(memory.significanceScore || "0.0");

    // Weighted combination
    const importance =
      significanceScore * 0.4 +
      connectionWeight * 0.3 +
      accessWeight * 0.2 +
      recencyWeight * 0.1;

    return Math.min(Math.max(importance, 0.0), 1.0); // Clamp to [0, 1]
  }

  /**
   * Calculate significance score based on emotional properties
   *
   * High significance factors:
   * - High intensity emotions
   * - Breakthrough discoveries
   * - Extreme valence (very positive or very negative)
   * - High wonder index
   * - Complex emotions
   *
   * @param memory - Emotion trajectory record
   * @returns Significance score (0.0-1.0)
   */
  calculateSignificance(memory: EmotionTrajectory): number {
    const intensity = parseFloat(memory.intensity);
    const valence = parseFloat(memory.valence);
    const wonderIndex = parseFloat(memory.wonderIndex);

    // Discovery level significance
    const discoveryWeight: Record<string, number> = {
      routine: 0.1,
      normal: 0.3,
      significant: 0.6,
      breakthrough: 0.9,
      transcendent: 1.0
    };
    const discoveryScore = discoveryWeight[memory.discoveryLevel] || 0.3;

    // Complexity significance
    const complexityWeight: Record<string, number> = {
      simple: 0.2,
      layered: 0.5,
      paradoxical: 0.8,
      transcendent: 1.0
    };
    const complexityScore = complexityWeight[memory.complexity] || 0.2;

    // Emotional extremity (both very positive and very negative are significant)
    const valenceMagnitude = Math.abs(valence);

    // Weighted combination
    const significance =
      intensity * 0.3 +
      discoveryScore * 0.25 +
      complexityScore * 0.2 +
      wonderIndex * 0.15 +
      valenceMagnitude * 0.1;

    return Math.min(Math.max(significance, 0.0), 1.0);
  }

  /**
   * Check if a memory should be graduated to a higher tier
   *
   * Graduation rules:
   * - EPHEMERAL → SESSION: Automatically on first access
   * - SESSION → IMPORTANT: ANY condition met (connections >= 5 OR accesses >= 10 OR significance >= 0.7)
   * - IMPORTANT → CORE: ALL conditions met (connections >= 15 AND accesses >= 30 AND significance >= 0.9 AND age >= 7 days)
   *
   * @param memory - Emotion trajectory record
   * @returns New tier if graduated, null otherwise
   */
  async checkGraduation(
    memory: EmotionTrajectory
  ): Promise<MemoryTier | null> {
    const currentTier = (memory.memoryTier || MemoryTier.EPHEMERAL) as MemoryTier;
    const importance = this.calculateImportance(memory);
    const ageInDays = Math.max(
      0,
      (Date.now() - memory.timestamp.getTime()) / (1000 * 60 * 60 * 24)
    );

    // SESSION → IMPORTANT (OR condition: any one is sufficient)
    if (currentTier === MemoryTier.SESSION) {
      const thresholds = this.thresholds.sessionToImportant;
      const meetsConnectionThreshold =
        (memory.connectionCount || 0) >= thresholds.connectionCount;
      const meetsAccessThreshold =
        (memory.accessCount || 0) >= thresholds.accessCount;
      const meetsSignificanceThreshold =
        importance >= thresholds.significanceScore;

      if (
        meetsConnectionThreshold ||
        meetsAccessThreshold ||
        meetsSignificanceThreshold
      ) {
        this.logger.info(
          "[MemoryGraduation] Memory eligible for SESSION → IMPORTANT",
          {
            memoryId: memory.id,
            connectionCount: memory.connectionCount,
            accessCount: memory.accessCount,
            importance,
            meetsConnectionThreshold,
            meetsAccessThreshold,
            meetsSignificanceThreshold,
          }
        );
        return MemoryTier.IMPORTANT;
      }
    }

    // IMPORTANT → CORE (AND condition: all must be met)
    if (currentTier === MemoryTier.IMPORTANT) {
      const thresholds = this.thresholds.importantToCore;
      const meetsConnectionThreshold =
        (memory.connectionCount || 0) >= thresholds.connectionCount;
      const meetsAccessThreshold =
        (memory.accessCount || 0) >= thresholds.accessCount;
      const meetsSignificanceThreshold =
        importance >= thresholds.significanceScore;
      const meetsAgeThreshold = ageInDays >= thresholds.ageInDays;

      if (
        meetsConnectionThreshold &&
        meetsAccessThreshold &&
        meetsSignificanceThreshold &&
        meetsAgeThreshold
      ) {
        this.logger.info(
          "[MemoryGraduation] Memory eligible for IMPORTANT → CORE",
          {
            memoryId: memory.id,
            connectionCount: memory.connectionCount,
            accessCount: memory.accessCount,
            importance,
            ageInDays,
          }
        );
        return MemoryTier.CORE;
      }
    }

    return null; // No graduation
  }

  /**
   * Graduate a memory to a new tier
   *
   * Updates the database record with the new tier and graduation timestamp
   *
   * @param memoryId - Memory ID to graduate
   * @param newTier - New memory tier
   */
  async graduateMemory(
    memoryId: string,
    newTier: MemoryTier
  ): Promise<void> {
    try {
      this.logger.debug("[MemoryGraduation] Graduating memory", {
        memoryId,
        newTier,
      });

      await this.database
        .update(emotionTrajectory)
        .set({
          memoryTier: newTier,
          graduatedAt: new Date(),
        })
        .where(eq(emotionTrajectory.id, memoryId));

      this.logger.info("[MemoryGraduation] Memory graduated successfully", {
        memoryId,
        newTier,
      });
    } catch (err: unknown) {
      this.logger.error("[MemoryGraduation] Failed to graduate memory", {
        memoryId,
        newTier,
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Failed to graduate memory: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  /**
   * Update memory metrics (access count, connections, scores)
   *
   * @param memoryId - Memory ID to update
   * @param updates - Partial updates to apply
   */
  async updateMemoryMetrics(
    memoryId: string,
    updates: {
      accessCount?: number;
      connectionCount?: number;
      significanceScore?: number;
      importanceScore?: number;
    }
  ): Promise<void> {
    try {
      this.logger.debug("[MemoryGraduation] Updating memory metrics", {
        memoryId,
        updates,
      });

      // Convert decimal fields to strings for Drizzle
      const dbUpdates: any = {};
      if (updates.accessCount !== undefined) dbUpdates.accessCount = updates.accessCount;
      if (updates.connectionCount !== undefined) dbUpdates.connectionCount = updates.connectionCount;
      if (updates.significanceScore !== undefined) dbUpdates.significanceScore = updates.significanceScore.toFixed(2);
      if (updates.importanceScore !== undefined) dbUpdates.importanceScore = updates.importanceScore.toFixed(2);

      await this.database
        .update(emotionTrajectory)
        .set(dbUpdates)
        .where(eq(emotionTrajectory.id, memoryId));

      this.logger.debug("[MemoryGraduation] Memory metrics updated", {
        memoryId,
      });
    } catch (err: unknown) {
      this.logger.error("[MemoryGraduation] Failed to update memory metrics", {
        memoryId,
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Failed to update memory metrics: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  /**
   * Increment access count for a memory
   *
   * Also checks if memory should be graduated after access
   *
   * @param memoryId - Memory ID to increment
   * @returns True if memory was graduated
   */
  async incrementAccessCount(memoryId: string): Promise<boolean> {
    try {
      // Get current memory
      const [memory] = await this.database
        .select()
        .from(emotionTrajectory)
        .where(eq(emotionTrajectory.id, memoryId))
        .limit(1);

      if (!memory) {
        this.logger.warn("[MemoryGraduation] Memory not found", { memoryId });
        return false;
      }

      // Increment access count
      const newAccessCount = (memory.accessCount || 0) + 1;
      const newImportance = this.calculateImportance({
        ...memory,
        accessCount: newAccessCount,
      });

      await this.updateMemoryMetrics(memoryId, {
        accessCount: newAccessCount,
        importanceScore: parseFloat(newImportance.toFixed(2)),
      });

      // Check for graduation
      const updatedMemory = { ...memory, accessCount: newAccessCount };
      const newTier = await this.checkGraduation(updatedMemory);

      if (newTier) {
        await this.graduateMemory(memoryId, newTier);
        return true;
      }

      return false;
    } catch (err: unknown) {
      this.logger.error("[MemoryGraduation] Failed to increment access count", {
        memoryId,
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Failed to increment access count: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  /**
   * Get memories by tier for a user
   *
   * @param userId - User ID
   * @param tier - Memory tier to filter by
   * @param limit - Maximum number of memories to return
   * @returns Array of memories
   */
  async getMemoriesByTier(
    userId: string,
    tier: MemoryTier,
    limit: number = 50
  ): Promise<EmotionTrajectory[]> {
    try {
      this.logger.debug("[MemoryGraduation] Fetching memories by tier", {
        userId,
        tier,
        limit,
      });

      const memories = await this.database
        .select()
        .from(emotionTrajectory)
        .where(
          and(
            eq(emotionTrajectory.userId, userId),
            eq(emotionTrajectory.memoryTier, tier)
          )
        )
        .orderBy(sql`${emotionTrajectory.importanceScore} DESC`)
        .limit(limit);

      return memories;
    } catch (err: unknown) {
      this.logger.error("[MemoryGraduation] Failed to fetch memories by tier", {
        userId,
        tier,
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Failed to fetch memories by tier: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  /**
   * Run graduation checks for all eligible memories for a user
   *
   * Batch process to graduate multiple memories at once
   *
   * @param userId - User ID
   * @returns Number of memories graduated
   */
  async runGraduationBatch(userId: string): Promise<number> {
    try {
      this.logger.debug("[MemoryGraduation] Running graduation batch", {
        userId,
      });

      // Get all non-CORE memories
      const memories = await this.database
        .select()
        .from(emotionTrajectory)
        .where(eq(emotionTrajectory.userId, userId));

      let graduatedCount = 0;

      for (const memory of memories) {
        if (memory.memoryTier === MemoryTier.CORE) continue;

        const newTier = await this.checkGraduation(memory);
        if (newTier) {
          await this.graduateMemory(memory.id, newTier);
          graduatedCount++;
        }
      }

      this.logger.info("[MemoryGraduation] Graduation batch complete", {
        userId,
        graduatedCount,
        totalChecked: memories.length,
      });

      return graduatedCount;
    } catch (err: unknown) {
      this.logger.error("[MemoryGraduation] Graduation batch failed", {
        userId,
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Graduation batch failed: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }
}
