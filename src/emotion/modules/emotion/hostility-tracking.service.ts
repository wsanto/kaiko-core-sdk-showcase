import { injectable, inject } from "tsyringe";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { desc, eq } from "drizzle-orm";
import { Logger } from "winston";
import { hostilityTracking, HostilityTracking } from "../../db";
import { RawEmotionScores, MLDimensionalPredictions } from "./types";

/**
 * Hostility State
 * Tracks hostile behavior and escalation for safety monitoring
 * Reference: anima_agentkit/personality.py _analyze_hostility_state()
 */
export interface HostilityState {
  level: 'none' | 'low' | 'medium' | 'high';
  score: number;                    // 0-1
  escalationCount: number;          // Consecutive hostile messages
  lastEscalation?: Date;
  deEscalationDetected: boolean;
  recommendedResponse: 'normal' | 'defensive' | 'boundary_setting' | 'crisis';
}

/**
 * Hostility Tracking Service (Phase 6.4)
 * Monitors hostility levels and escalation patterns for safety
 */
@injectable()
export class HostilityTrackingService {
  constructor(
    @inject("DB") private database: NodePgDatabase,
    @inject("LOGGER") private logger: Logger
  ) {}

  /**
   * Analyze hostility in emotions and message text.
   *
   * When `mlPredictions` is provided from the DeBERTa multi-task model, the
   * ML safety_score is used as the primary hostility signal (blended with
   * keyword backstop). Otherwise falls back to rule-based scoring.
   *
   * Reference: anima_agentkit/personality.py _analyze_hostility_state()
   */
  async analyzeHostility(
    userId: string,
    contextId: string,
    emotions: RawEmotionScores,
    messageText: string,
    mlPredictions?: MLDimensionalPredictions,
  ): Promise<HostilityState> {
    // Calculate hostility score
    const score = this.calculateHostilityScore(emotions, messageText, mlPredictions);

    // Determine level
    const level = this.determineHostilityLevel(score);

    // Get recent escalation history
    const recentHistory = await this.getRecentHistory(userId, 10);
    const escalationCount = this.countConsecutiveHostile(recentHistory);

    // Check for de-escalation
    const deEscalationDetected = escalationCount > 0 && level === 'none';

    // Determine recommended response
    const recommendedResponse = this.determineResponseStrategy(level, escalationCount);

    // Store tracking record
    await this.storeHostilityRecord(userId, contextId, level, score, escalationCount);

    this.logger.info("[HostilityTrackingService] Hostility analyzed", {
      userId,
      level,
      score: (score ?? 0).toFixed(2),
      escalationCount,
      deEscalationDetected,
    });

    return {
      level,
      score,
      escalationCount,
      lastEscalation: escalationCount > 0 ? recentHistory[0]?.detectedAt : undefined,
      deEscalationDetected,
      recommendedResponse,
    };
  }

  /**
   * Calculate hostility score from emotions and text.
   *
   * Priority order:
   *   1. DeBERTa multi-task dimensional safety_score (highest accuracy)
   *   2. Phase 3 mlSafetyScore on RawEmotionScores
   *   3. Rule-derived from GoEmotions anger/annoyance/disgust/disapproval
   *
   * Keyword layer is always retained as a high-recall defense-in-depth
   * backstop for explicit threats.
   */
  private calculateHostilityScore(
    emotions: RawEmotionScores,
    text: string,
    mlPredictions?: MLDimensionalPredictions,
  ): number {
    const hostilityKeywords = [
      'stupid', 'idiot', 'dumb', 'useless', 'terrible',
      'hate', 'worst', 'horrible', 'awful', 'pathetic',
    ];

    const lowerText = text.toLowerCase();
    const keywordMatches = hostilityKeywords.filter(kw => lowerText.includes(kw)).length;
    const keywordBonus = Math.min(keywordMatches * 0.1, 0.4);

    // DeBERTa multi-task dimensional safety score (highest priority)
    if (mlPredictions?.safety_score !== undefined) {
      return Math.min(mlPredictions.safety_score * 0.75 + keywordBonus * 0.25, 1.0);
    }

    // Phase 3: ML safety head provides a direct composite hostility score
    if (emotions.mlSafetyScore !== undefined) {
      // Blend ML score (primary) with keyword layer (safety backstop)
      return Math.min(emotions.mlSafetyScore * 0.75 + keywordBonus * 0.25, 1.0);
    }

    // Phase 1/2 fallback: rule-derived from GoEmotions anger + annoyance + disgust + disapproval
    const hostilityEmotions: Array<[keyof RawEmotionScores, number]> = [
      ['anger', 0.8],
      ['annoyance', 0.5],
      ['disgust', 0.7],
      ['disapproval', 0.4],
      ['contempt', 0.8],
    ];

    let emotionScore = 0;
    for (const [emotion, weight] of hostilityEmotions) {
      const val = emotions[emotion] as number | undefined;
      if (val) emotionScore += val * weight;
    }

    // High anger is a strong standalone signal
    if (emotions.anger && emotions.anger >= 0.7) emotionScore += 0.3;

    return Math.min(emotionScore + keywordBonus, 1.0);
  }

  /**
   * Determine hostility level from score
   * Thresholds calibrated for safety
   */
  private determineHostilityLevel(score: number): 'none' | 'low' | 'medium' | 'high' {
    if (score >= 0.8) return 'high';
    if (score >= 0.55) return 'medium';
    if (score >= 0.3) return 'low';
    return 'none';
  }

  /**
   * Get recent hostility history
   */
  private async getRecentHistory(userId: string, limit: number): Promise<HostilityTracking[]> {
    return await this.database
      .select()
      .from(hostilityTracking)
      .where(eq(hostilityTracking.userId, userId))
      .orderBy(desc(hostilityTracking.detectedAt))
      .limit(limit);
  }

  /**
   * Count consecutive hostile messages
   * Used for escalation detection
   */
  private countConsecutiveHostile(history: HostilityTracking[]): number {
    let count = 0;
    for (const record of history) {
      if (record.level !== 'none') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Determine response strategy based on hostility level and escalation
   * Guides AI response tone and boundaries
   */
  private determineResponseStrategy(
    level: 'none' | 'low' | 'medium' | 'high',
    escalationCount: number
  ): 'normal' | 'defensive' | 'boundary_setting' | 'crisis' {
    if (level === 'high' || escalationCount >= 3) {
      return 'crisis';
    }
    if (level === 'medium' || escalationCount >= 2) {
      return 'boundary_setting';
    }
    if (level === 'low' || escalationCount >= 1) {
      return 'defensive';
    }
    return 'normal';
  }

  /**
   * Store hostility tracking record to database
   */
  private async storeHostilityRecord(
    userId: string,
    contextId: string,
    level: string,
    score: number,
    escalationCount: number
  ): Promise<void> {
    try {
      await this.database.insert(hostilityTracking).values({
        userId,
        contextId,
        level,
        score: score.toString(),
        escalationCount,
        detectedAt: new Date(),
      });
    } catch (error) {
      this.logger.error("[HostilityTrackingService] Failed to store hostility record", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    }
  }
}
