import { injectable, inject } from "tsyringe";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { Logger } from "winston";
import {
  emotionTrajectory,
  EmotionTrajectory,
  InsertEmotionTrajectory,
} from "../../db";
import { EmotionItemV2, EmotionalMomentum } from "./types.v2";
import { RawEmotionScores } from "./types";
import { MemoryGraduationService, MemoryTier } from "./memory-graduation.service";

/**
 * Pattern Types for Emotional Analysis
 * Based on: anima_agentkit/emotional_trend_analyzer.py PatternType
 */
export enum PatternType {
  TEMPORAL = "temporal", // Time-based patterns (e.g., "Monday morning anxiety")
  TRIGGER_BASED = "trigger_based", // Event-triggered reactions
  CYCLICAL = "cyclical", // Repeating emotional cycles
  SEQUENTIAL = "sequential", // One emotion leads to another
  RECOVERY = "recovery", // Bounce-back patterns (resilience)
}

/**
 * Time Windows for Trajectory Analysis
 */
export enum TimeWindow {
  WEEK = 7, // 7-day window
  MONTH = 30, // 30-day window
  QUARTER = 90, // 90-day window
}

/**
 * Emotional Baseline Metrics
 */
export interface EmotionalBaseline {
  userId: string;
  window: TimeWindow;
  periodStart: Date;
  periodEnd: Date;
  dataPointCount: number;

  // Aggregate metrics
  dominantEmotions: Record<string, number>; // emotion -> frequency (0-1)
  averageIntensity: number; // 0-1
  baselineValence: number; // -1 to 1
  baselineArousal: number; // 0-1
  emotionalVolatility: number; // 0-1 (standard deviation of intensity)
  averageComplexity: string; // most common complexity level
  averageWonderIndex: number; // 0-1
  breakthroughCount: number; // Count of breakthrough/transcendent moments
}

/**
 * Detected Emotional Pattern
 */
export interface DetectedPattern {
  patternId: string;
  patternType: PatternType;
  name: string;
  description: string;
  trigger?: string; // Optional trigger (e.g., "Monday", "after work")
  emotionalSequence: string[]; // Sequence of emotions
  frequency: number; // Times observed
  confidence: number; // 0-1
  lastOccurrence: Date;
  firstDetected: Date;
  typicalDuration?: number; // Optional duration in minutes
  typicalIntensity?: number; // Optional average intensity
}

/**
 * Trajectory Trend Analysis
 */
export interface TrendAnalysis {
  userId: string;
  window: TimeWindow;
  direction: "improving" | "stable" | "declining";
  valenceTrend: number; // Change in valence over time
  intensityTrend: number; // Change in intensity over time
  wonderTrend: number; // Change in wonder index over time
  breakthroughRate: number; // Breakthroughs per week
}

/**
 * Trajectory Service
 *
 * Tracks emotional changes over time for trajectory analysis and pattern detection.
 * Ported from: anima_agentkit/emotional_trend_analyzer.py
 *
 * Phase 2.1: Trajectory Tracking Service
 */
@injectable()
export class TrajectoryService {
  constructor(
    @inject("DB") private database: NodePgDatabase,
    @inject("LOGGER") private logger: Logger,
    @inject(MemoryGraduationService) private graduationService: MemoryGraduationService
  ) {}

  /**
   * Store emotional data point in trajectory
   *
   * Phase 3.2 Integration: Automatically calculates significance and importance scores,
   * and sets initial memory tier to SESSION.
   *
   * @param userId - User identifier
   * @param emotionData - Analyzed emotion data from EQAnalysisService
   * @param contextId - Optional conversation context ID
   * @param externalId - Optional external message/event ID
   * @param metadata - Additional metadata (triggers, patterns, etc.)
   * @returns Memory ID of the stored trajectory point
   */
  async storeTrajectoryPoint(
    userId: string,
    emotionData: EmotionItemV2,
    contextId?: string,
    externalId?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      // Create a mock memory object for significance calculation
      const mockMemory: Partial<EmotionTrajectory> = {
        userId,
        dominantEmotion: emotionData.category,
        intensity: emotionData.intensity.toString(),
        valence: emotionData.valence.toString(),
        arousal: emotionData.arousal.toString(),
        complexity: emotionData.complexity,
        wonderIndex: emotionData.wonderIndex.toString(),
        discoveryLevel: emotionData.discoveryLevel,
        timestamp: new Date(),
        accessCount: 0,
        connectionCount: 0,
      } as EmotionTrajectory;

      // Phase 3.2: Calculate significance and importance scores
      const significanceScore = this.graduationService.calculateSignificance(mockMemory as EmotionTrajectory);
      const importanceScore = this.graduationService.calculateImportance(mockMemory as EmotionTrajectory);

      // Phase 6.1: Extract emotional signature fields from metadata if present
      const emotionalVector = metadata?.emotionalVector as number[] | undefined;
      const emotionalTags = metadata?.emotionalTags as string[] | undefined;
      const emotionalSignature = metadata?.emotionalSignature as string | undefined;

      const trajectoryPoint: InsertEmotionTrajectory = {
        userId,
        contextId,
        externalId,
        dominantEmotion: emotionData.category,
        intensity: emotionData.intensity.toString(),
        valence: emotionData.valence.toString(),
        arousal: emotionData.arousal.toString(),
        complexity: emotionData.complexity,
        wonderIndex: emotionData.wonderIndex.toString(),
        discoveryLevel: emotionData.discoveryLevel,
        rawEmotions: emotionData.raw as unknown as Record<string, unknown>,
        metadata: metadata as unknown as Record<string, unknown>,
        // Phase 3.2: Memory graduation fields
        memoryTier: MemoryTier.SESSION, // Initial tier
        accessCount: 0,
        connectionCount: 0,
        significanceScore: (significanceScore ?? 0).toFixed(2),
        importanceScore: (importanceScore ?? 0).toFixed(2),
        // Phase 6.1: Emotional signature fields
        emotionalVector: emotionalVector as unknown as number[],
        emotionalTags: emotionalTags,
        emotionalSignature: emotionalSignature,
      };

      const [result] = await this.database
        .insert(emotionTrajectory)
        .values(trajectoryPoint)
        .returning({ id: emotionTrajectory.id });

      this.logger.debug("[TrajectoryService] Stored trajectory point", {
        userId,
        memoryId: result.id,
        emotion: emotionData.category,
        intensity: emotionData.intensity,
        significanceScore: (significanceScore ?? 0).toFixed(2),
        importanceScore: (importanceScore ?? 0).toFixed(2),
        memoryTier: MemoryTier.SESSION,
      });

      return result.id;
    } catch (error) {
      this.logger.error("[TrajectoryService] Failed to store trajectory point", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      throw new Error("Failed to store emotional trajectory point");
    }
  }

  /**
   * Calculate emotional baseline for a user over a time window
   *
   * Based on: emotional_trend_analyzer.py calculate_baseline()
   *
   * @param userId - User identifier
   * @param window - Time window (7, 30, or 90 days)
   * @returns Emotional baseline metrics
   */
  async calculateBaseline(
    userId: string,
    window: TimeWindow = TimeWindow.MONTH
  ): Promise<EmotionalBaseline | null> {
    try {
      const periodEnd = new Date();
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - window);

      // Fetch trajectory data for the time window
      const trajectoryData = await this.database
        .select()
        .from(emotionTrajectory)
        .where(
          and(
            eq(emotionTrajectory.userId, userId),
            gte(emotionTrajectory.timestamp, periodStart),
            lte(emotionTrajectory.timestamp, periodEnd)
          )
        )
        .orderBy(desc(emotionTrajectory.timestamp));

      if (trajectoryData.length === 0) {
        this.logger.debug("[TrajectoryService] No trajectory data found", {
          userId,
          window,
        });
        return null;
      }

      // Calculate dominant emotions (frequency distribution)
      const emotionCounts: Record<string, number> = {};
      let totalIntensity = 0;
      let totalValence = 0;
      let totalArousal = 0;
      let totalWonderIndex = 0;
      const intensities: number[] = [];
      const complexityCounts: Record<string, number> = {};
      let breakthroughCount = 0;

      trajectoryData.forEach((point) => {
        // Count emotions
        emotionCounts[point.dominantEmotion] =
          (emotionCounts[point.dominantEmotion] || 0) + 1;

        // Sum metrics for averaging
        const intensity = parseFloat(point.intensity);
        const valence = parseFloat(point.valence);
        const arousal = parseFloat(point.arousal);
        const wonderIndex = parseFloat(point.wonderIndex);

        totalIntensity += intensity;
        totalValence += valence;
        totalArousal += arousal;
        totalWonderIndex += wonderIndex;
        intensities.push(intensity);

        // Count complexity levels
        complexityCounts[point.complexity] =
          (complexityCounts[point.complexity] || 0) + 1;

        // Count breakthroughs
        if (
          point.discoveryLevel === "breakthrough" ||
          point.discoveryLevel === "transcendent"
        ) {
          breakthroughCount++;
        }
      });

      const dataPointCount = trajectoryData.length;

      // Convert emotion counts to frequencies (0-1)
      const dominantEmotions: Record<string, number> = {};
      Object.entries(emotionCounts).forEach(([emotion, count]) => {
        dominantEmotions[emotion] = count / dataPointCount;
      });

      // Calculate emotional volatility (standard deviation of intensity)
      const avgIntensity = totalIntensity / dataPointCount;
      const variance =
        intensities.reduce((sum, val) => sum + Math.pow(val - avgIntensity, 2), 0) /
        dataPointCount;
      const emotionalVolatility = Math.sqrt(variance);

      // Find most common complexity level
      const averageComplexity = Object.entries(complexityCounts).reduce((max, curr) =>
        curr[1] > max[1] ? curr : max
      )[0];

      const baseline: EmotionalBaseline = {
        userId,
        window,
        periodStart,
        periodEnd,
        dataPointCount,
        dominantEmotions,
        averageIntensity: avgIntensity,
        baselineValence: totalValence / dataPointCount,
        baselineArousal: totalArousal / dataPointCount,
        emotionalVolatility,
        averageComplexity,
        averageWonderIndex: totalWonderIndex / dataPointCount,
        breakthroughCount,
      };

      this.logger.debug("[TrajectoryService] Calculated baseline", {
        userId,
        window,
        dataPointCount,
        avgIntensity,
      });

      return baseline;
    } catch (error) {
      this.logger.error("[TrajectoryService] Failed to calculate baseline", {
        error: error instanceof Error ? error.message : String(error),
        userId,
        window,
      });
      throw new Error("Failed to calculate emotional baseline");
    }
  }

  /**
   * Analyze emotional trends over time
   *
   * @param userId - User identifier
   * @param window - Time window for analysis
   * @returns Trend analysis with direction and metrics
   */
  async analyzeTrend(
    userId: string,
    window: TimeWindow = TimeWindow.MONTH
  ): Promise<TrendAnalysis | null> {
    try {
      const periodEnd = new Date();
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - window);

      // Split window in half to compare trends
      const midPoint = new Date(
        periodStart.getTime() + (periodEnd.getTime() - periodStart.getTime()) / 2
      );

      // Get first half data
      const firstHalf = await this.database
        .select()
        .from(emotionTrajectory)
        .where(
          and(
            eq(emotionTrajectory.userId, userId),
            gte(emotionTrajectory.timestamp, periodStart),
            lte(emotionTrajectory.timestamp, midPoint)
          )
        );

      // Get second half data
      const secondHalf = await this.database
        .select()
        .from(emotionTrajectory)
        .where(
          and(
            eq(emotionTrajectory.userId, userId),
            gte(emotionTrajectory.timestamp, midPoint),
            lte(emotionTrajectory.timestamp, periodEnd)
          )
        );

      if (firstHalf.length === 0 || secondHalf.length === 0) {
        return null;
      }

      // Calculate averages for each half
      const firstAvgValence =
        firstHalf.reduce((sum, p) => sum + parseFloat(p.valence), 0) / firstHalf.length;
      const secondAvgValence =
        secondHalf.reduce((sum, p) => sum + parseFloat(p.valence), 0) /
        secondHalf.length;

      const firstAvgIntensity =
        firstHalf.reduce((sum, p) => sum + parseFloat(p.intensity), 0) /
        firstHalf.length;
      const secondAvgIntensity =
        secondHalf.reduce((sum, p) => sum + parseFloat(p.intensity), 0) /
        secondHalf.length;

      const firstAvgWonder =
        firstHalf.reduce((sum, p) => sum + parseFloat(p.wonderIndex), 0) /
        firstHalf.length;
      const secondAvgWonder =
        secondHalf.reduce((sum, p) => sum + parseFloat(p.wonderIndex), 0) /
        secondHalf.length;

      // Count breakthroughs in second half
      const breakthroughs = secondHalf.filter(
        (p) => p.discoveryLevel === "breakthrough" || p.discoveryLevel === "transcendent"
      ).length;
      const weeksInPeriod = window / 7;
      const breakthroughRate = breakthroughs / weeksInPeriod;

      // Calculate trends (change from first to second half)
      const valenceTrend = secondAvgValence - firstAvgValence;
      const intensityTrend = secondAvgIntensity - firstAvgIntensity;
      const wonderTrend = secondAvgWonder - firstAvgWonder;

      // Determine overall direction
      let direction: "improving" | "stable" | "declining" = "stable";
      const improvementScore = valenceTrend + wonderTrend;

      if (improvementScore > 0.1) {
        direction = "improving";
      } else if (improvementScore < -0.1) {
        direction = "declining";
      }

      const trendAnalysis: TrendAnalysis = {
        userId,
        window,
        direction,
        valenceTrend,
        intensityTrend,
        wonderTrend,
        breakthroughRate,
      };

      this.logger.debug("[TrajectoryService] Analyzed trend", {
        userId,
        window,
        direction,
      });

      return trendAnalysis;
    } catch (error) {
      this.logger.error("[TrajectoryService] Failed to analyze trend", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      throw new Error("Failed to analyze emotional trend");
    }
  }

  /**
   * Detect breakthrough moments (high-significance emotional events)
   *
   * Based on: personality.py detect_breakthrough()
   *
   * @param current - Current emotion data
   * @param baseline - User's emotional baseline
   * @returns Breakthrough detection result
   */
  detectBreakthrough(
    current: EmotionItemV2,
    baseline: EmotionalBaseline | null
  ): {
    detected: boolean;
    type?: string;
    significance?: number;
  } {
    // Explicit discovery level check
    if (
      current.discoveryLevel === "breakthrough" ||
      current.discoveryLevel === "transcendent"
    ) {
      return {
        detected: true,
        type: "discovery_level",
        significance: current.intensity,
      };
    }

    // If no baseline, can't detect intensity spikes
    if (!baseline) {
      return { detected: false };
    }

    // Intensity spike >= 0.35 above baseline
    if (current.intensity - baseline.averageIntensity >= 0.35) {
      return {
        detected: true,
        type: "intensity_spike",
        significance: current.intensity - baseline.averageIntensity,
      };
    }

    // Wonder explosion >= 0.9
    if (current.wonderIndex >= 0.9) {
      return {
        detected: true,
        type: "wonder_explosion",
        significance: current.wonderIndex,
      };
    }

    return { detected: false };
  }

  /**
   * Get recent trajectory points for a user
   *
   * @param userId - User identifier
   * @param limit - Number of recent points to fetch
   * @returns Array of trajectory points
   */
  async getRecentTrajectory(
    userId: string,
    limit: number = 50
  ): Promise<EmotionTrajectory[]> {
    try {
      const trajectoryData = await this.database
        .select()
        .from(emotionTrajectory)
        .where(eq(emotionTrajectory.userId, userId))
        .orderBy(desc(emotionTrajectory.timestamp))
        .limit(limit);

      return trajectoryData;
    } catch (error) {
      this.logger.error("[TrajectoryService] Failed to get recent trajectory", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      throw new Error("Failed to retrieve trajectory data");
    }
  }

  /**
   * Identify emotional patterns in trajectory data
   *
   * Based on: emotional_trend_analyzer.py identify_patterns()
   *
   * @param userId - User identifier
   * @param window - Time window for pattern analysis
   * @param minObservations - Minimum observations required for pattern detection (default: 3)
   * @param confidenceThreshold - Minimum confidence threshold (default: 0.6)
   * @returns Array of detected patterns
   */
  async identifyPatterns(
    userId: string,
    window: TimeWindow = TimeWindow.MONTH,
    minObservations: number = 3,
    confidenceThreshold: number = 0.6
  ): Promise<DetectedPattern[]> {
    try {
      const periodEnd = new Date();
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - window);

      // Fetch trajectory data for the time window
      const trajectoryData = await this.database
        .select()
        .from(emotionTrajectory)
        .where(
          and(
            eq(emotionTrajectory.userId, userId),
            gte(emotionTrajectory.timestamp, periodStart),
            lte(emotionTrajectory.timestamp, periodEnd)
          )
        )
        .orderBy(emotionTrajectory.timestamp);

      if (trajectoryData.length < minObservations) {
        this.logger.debug("[TrajectoryService] Insufficient data for pattern detection", {
          userId,
          dataPoints: trajectoryData.length,
        });
        return [];
      }

      const patterns: DetectedPattern[] = [];

      // Detect all pattern types
      patterns.push(...this.detectTemporalPatterns(trajectoryData, minObservations, confidenceThreshold));
      patterns.push(...this.detectCyclicalPatterns(trajectoryData, minObservations));
      patterns.push(...this.detectSequentialPatterns(trajectoryData, minObservations, confidenceThreshold));
      patterns.push(...this.detectRecoveryPatterns(trajectoryData, minObservations));

      // Filter by confidence threshold
      const filteredPatterns = patterns.filter(p => p.confidence >= confidenceThreshold);

      this.logger.debug("[TrajectoryService] Pattern detection complete", {
        userId,
        totalPatterns: filteredPatterns.length,
        byType: {
          temporal: filteredPatterns.filter(p => p.patternType === PatternType.TEMPORAL).length,
          cyclical: filteredPatterns.filter(p => p.patternType === PatternType.CYCLICAL).length,
          sequential: filteredPatterns.filter(p => p.patternType === PatternType.SEQUENTIAL).length,
          recovery: filteredPatterns.filter(p => p.patternType === PatternType.RECOVERY).length,
        },
      });

      return filteredPatterns;
    } catch (error) {
      this.logger.error("[TrajectoryService] Failed to identify patterns", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      throw new Error("Failed to identify emotional patterns");
    }
  }

  /**
   * Detect temporal patterns (e.g., "Monday anxiety", "Friday joy")
   *
   * Based on: emotional_trend_analyzer.py _detect_temporal_patterns()
   */
  private detectTemporalPatterns(
    trajectoryData: EmotionTrajectory[],
    minObservations: number,
    confidenceThreshold: number
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const dayEmotions: Record<string, EmotionTrajectory[]> = {};

    // Group by day of week
    trajectoryData.forEach((point) => {
      const dayName = point.timestamp.toLocaleDateString('en-US', { weekday: 'long' });
      if (!dayEmotions[dayName]) {
        dayEmotions[dayName] = [];
      }
      dayEmotions[dayName].push(point);
    });

    // Look for consistent patterns
    Object.entries(dayEmotions).forEach(([dayName, points]) => {
      if (points.length < minObservations) return;

      // Find dominant emotion for this day
      const emotionCounts: Record<string, number> = {};
      points.forEach((point) => {
        emotionCounts[point.dominantEmotion] = (emotionCounts[point.dominantEmotion] || 0) + 1;
      });

      const dominant = Object.entries(emotionCounts).reduce((max, curr) =>
        curr[1] > max[1] ? curr : max
      )[0];

      const frequency = emotionCounts[dominant];
      const confidence = frequency / points.length;

      if (confidence >= confidenceThreshold) {
        // Calculate average intensity for this emotion on this day
        const relevantPoints = points.filter(p => p.dominantEmotion === dominant);
        const avgIntensity = relevantPoints.reduce((sum, p) => sum + parseFloat(p.intensity), 0) / relevantPoints.length;

        patterns.push({
          patternId: `temporal_${dayName}_${dominant}`,
          patternType: PatternType.TEMPORAL,
          name: `${dayName} ${dominant.charAt(0).toUpperCase() + dominant.slice(1)}`,
          description: `Tends to feel ${dominant} on ${dayName}s`,
          trigger: dayName,
          emotionalSequence: [dominant],
          frequency,
          confidence,
          lastOccurrence: new Date(Math.max(...points.map(p => p.timestamp.getTime()))),
          firstDetected: new Date(Math.min(...points.map(p => p.timestamp.getTime()))),
          typicalIntensity: avgIntensity,
        });
      }
    });

    return patterns;
  }

  /**
   * Detect cyclical patterns (alternating high/low intensity)
   *
   * Based on: emotional_trend_analyzer.py _detect_cycles()
   */
  private detectCyclicalPatterns(
    trajectoryData: EmotionTrajectory[],
    minObservations: number
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    if (trajectoryData.length < 10) return patterns;

    // Look for alternating high/low intensity cycles
    const intensities = trajectoryData.map(p => parseFloat(p.intensity));
    const cycles: Array<{ start: Date; end: Date; emotions: string[] }> = [];

    let i = 0;
    while (i < intensities.length - 2) {
      // Detect high-low-high pattern
      if (intensities[i] > 0.6 && intensities[i + 1] < 0.4 && intensities[i + 2] > 0.6) {
        cycles.push({
          start: trajectoryData[i].timestamp,
          end: trajectoryData[i + 2].timestamp,
          emotions: [
            trajectoryData[i].dominantEmotion,
            trajectoryData[i + 1].dominantEmotion,
            trajectoryData[i + 2].dominantEmotion,
          ],
        });
        i += 2;
      } else {
        i++;
      }
    }

    if (cycles.length >= minObservations) {
      // Calculate average duration
      const durations = cycles.map(
        c => (c.end.getTime() - c.start.getTime()) / (1000 * 60) // minutes
      );
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;

      patterns.push({
        patternId: "cyclical_intensity",
        patternType: PatternType.CYCLICAL,
        name: "Intensity Cycling",
        description: "Alternates between high and low emotional intensity",
        emotionalSequence: ["high_intensity", "low_intensity", "high_intensity"],
        frequency: cycles.length,
        confidence: Math.min(cycles.length / 10, 0.9), // Cap at 0.9
        lastOccurrence: cycles[cycles.length - 1].end,
        firstDetected: cycles[0].start,
        typicalDuration: Math.round(avgDuration),
      });
    }

    return patterns;
  }

  /**
   * Detect sequential patterns (emotion A → emotion B)
   *
   * Based on: emotional_trend_analyzer.py _detect_sequential_patterns()
   */
  private detectSequentialPatterns(
    trajectoryData: EmotionTrajectory[],
    minObservations: number,
    confidenceThreshold: number
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    if (trajectoryData.length < 2) return patterns;

    // Track emotion transitions
    const transitions: Record<string, Record<string, number>> = {};

    for (let i = 0; i < trajectoryData.length - 1; i++) {
      const fromEmotion = trajectoryData[i].dominantEmotion;
      const toEmotion = trajectoryData[i + 1].dominantEmotion;

      if (fromEmotion === toEmotion) continue; // Skip same emotion

      if (!transitions[fromEmotion]) {
        transitions[fromEmotion] = {};
      }
      transitions[fromEmotion][toEmotion] = (transitions[fromEmotion][toEmotion] || 0) + 1;
    }

    // Identify strong sequential patterns
    Object.entries(transitions).forEach(([fromEmotion, toEmotions]) => {
      const totalFrom = Object.values(toEmotions).reduce((sum, count) => sum + count, 0);

      Object.entries(toEmotions).forEach(([toEmotion, count]) => {
        if (count >= minObservations) {
          const confidence = count / totalFrom;

          if (confidence >= confidenceThreshold) {
            patterns.push({
              patternId: `sequential_${fromEmotion}_to_${toEmotion}`,
              patternType: PatternType.SEQUENTIAL,
              name: `${fromEmotion.charAt(0).toUpperCase() + fromEmotion.slice(1)} → ${toEmotion.charAt(0).toUpperCase() + toEmotion.slice(1)}`,
              description: `${fromEmotion} often leads to ${toEmotion}`,
              emotionalSequence: [fromEmotion, toEmotion],
              frequency: count,
              confidence,
              lastOccurrence: trajectoryData[trajectoryData.length - 1].timestamp,
              firstDetected: trajectoryData[0].timestamp,
            });
          }
        }
      });
    });

    return patterns;
  }

  /**
   * Detect recovery patterns (resilience - how quickly user bounces back from negative emotions)
   *
   * Based on: emotional_trend_analyzer.py _identify_resilience_patterns()
   */
  private detectRecoveryPatterns(
    trajectoryData: EmotionTrajectory[],
    minObservations: number
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    if (trajectoryData.length < 3) return patterns;

    // Track recovery from negative emotions
    const recoveries: Array<{ start: Date; end: Date; duration: number; fromEmotion: string }> = [];

    for (let i = 0; i < trajectoryData.length - 1; i++) {
      const current = trajectoryData[i];
      const valence = parseFloat(current.valence);

      // Check if current emotion is negative (valence < 0)
      if (valence < 0) {
        // Look for recovery to positive valence
        for (let j = i + 1; j < trajectoryData.length; j++) {
          const next = trajectoryData[j];
          const nextValence = parseFloat(next.valence);

          if (nextValence > 0) {
            // Found recovery
            const duration = (next.timestamp.getTime() - current.timestamp.getTime()) / (1000 * 60); // minutes
            recoveries.push({
              start: current.timestamp,
              end: next.timestamp,
              duration,
              fromEmotion: current.dominantEmotion,
            });
            break;
          }
        }
      }
    }

    if (recoveries.length >= minObservations) {
      // Calculate average recovery time
      const avgRecoveryTime = recoveries.reduce((sum, r) => sum + r.duration, 0) / recoveries.length;

      // Determine recovery speed
      let speedDescription = "slow";
      let confidence = 0.6;

      if (avgRecoveryTime < 30) {
        speedDescription = "fast";
        confidence = 0.9;
      } else if (avgRecoveryTime < 120) {
        speedDescription = "moderate";
        confidence = 0.75;
      }

      patterns.push({
        patternId: "recovery_resilience",
        patternType: PatternType.RECOVERY,
        name: `${speedDescription.charAt(0).toUpperCase() + speedDescription.slice(1)} Recovery`,
        description: `Shows ${speedDescription} emotional recovery (avg ${Math.round(avgRecoveryTime)} min)`,
        emotionalSequence: ["negative", "positive"],
        frequency: recoveries.length,
        confidence,
        lastOccurrence: recoveries[recoveries.length - 1].end,
        firstDetected: recoveries[0].start,
        typicalDuration: Math.round(avgRecoveryTime),
      });
    }

    return patterns;
  }

  /**
   * Find emotionally similar moments using vector similarity
   * Reference: emotional_rag.py retrieve_by_emotional_similarity()
   *
   * Phase 6.1: Vector-based emotional similarity search
   *
   * @param userId - User identifier
   * @param targetVector - 9-dimensional emotional vector to match
   * @param threshold - Minimum similarity threshold (0-1, default: 0.7)
   * @param limit - Maximum number of results (default: 10)
   * @returns Array of similar emotional moments
   */
  async findSimilarEmotionalMoments(
    userId: string,
    targetVector: number[],
    threshold: number = 0.7,
    limit: number = 10
  ): Promise<SimilarEmotionalMoment[]> {
    try {
      // Query database for trajectories with vectors
      const trajectories = await this.database
        .select()
        .from(emotionTrajectory)
        .where(
          and(
            eq(emotionTrajectory.userId, userId),
            sql`${emotionTrajectory.emotionalVector} IS NOT NULL`
          )
        )
        .orderBy(desc(emotionTrajectory.timestamp))
        .limit(100); // Get recent 100 for similarity calc

      if (trajectories.length === 0) {
        this.logger.debug("[TrajectoryService] No trajectories with vectors found", {
          userId,
        });
        return [];
      }

      // Calculate similarities
      const similar: SimilarEmotionalMoment[] = [];

      for (const trajectory of trajectories) {
        if (!trajectory.emotionalVector) continue;

        const similarity = this.calculateCosineSimilarity(
          targetVector,
          trajectory.emotionalVector as unknown as number[]
        );

        if (similarity >= threshold) {
          similar.push({
            memoryId: trajectory.id,
            similarity,
            emotion: trajectory.dominantEmotion,
            intensity: parseFloat(trajectory.intensity),
            timestamp: trajectory.timestamp,
            tags: (trajectory.emotionalTags as unknown as string[]) || [],
            context: (trajectory.metadata as any)?.text_preview,
          });
        }
      }

      // Sort by similarity (highest first) and limit
      const results = similar
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      this.logger.info("[TrajectoryService] Similar moments found", {
        userId,
        totalScanned: trajectories.length,
        similarCount: results.length,
        threshold,
        topSimilarity: results[0]?.similarity.toFixed(3),
      });

      return results;
    } catch (error) {
      this.logger.error("[TrajectoryService] Failed to find similar moments", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * Assumes vectors are already normalized
   */
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      this.logger.warn("[TrajectoryService] Vector length mismatch", {
        length1: vec1.length,
        length2: vec2.length,
      });
      return 0;
    }

    // Dot product (vectors are pre-normalized)
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);

    // Clamp to [0, 1] range
    return Math.max(0, Math.min(1, dotProduct));
  }

  /**
   * Track emotional momentum over a time window (Phase 6.3)
   * Reference: emotional_rag.py track_emotional_momentum()
   */
  async trackEmotionalMomentum(
    userId: string,
    windowHours: number = 24
  ): Promise<EmotionalMomentum | null> {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - windowHours);

      // Get recent trajectory points
      const trajectories = await this.database
        .select()
        .from(emotionTrajectory)
        .where(
          and(
            eq(emotionTrajectory.userId, userId),
            gte(emotionTrajectory.timestamp, startTime)
          )
        )
        .orderBy(emotionTrajectory.timestamp);

      if (trajectories.length < 2) {
        this.logger.debug("[TrajectoryService] Insufficient data for momentum calculation", {
          userId,
          dataPoints: trajectories.length,
        });
        return null;
      }

      const latest = trajectories[trajectories.length - 1];
      const earliest = trajectories[0];

      // Calculate metrics
      const intensities = trajectories.map(t => parseFloat(t.intensity));
      const wonderIndices = trajectories.map(t => parseFloat(t.wonderIndex));
      const valences = trajectories.map(t => parseFloat(t.valence));

      const avgIntensity = intensities.reduce((a, b) => a + b, 0) / intensities.length;
      const avgWonder = wonderIndices.reduce((a, b) => a + b, 0) / wonderIndices.length;
      const avgValence = valences.reduce((a, b) => a + b, 0) / valences.length;

      // Calculate volatility (standard deviation)
      const variance = intensities.reduce((sum, val) => sum + Math.pow(val - avgIntensity, 2), 0) / intensities.length;
      const volatility = Math.sqrt(variance);

      // Calculate momentum (change per hour)
      const timeDiffHours = (latest.timestamp.getTime() - earliest.timestamp.getTime()) / (1000 * 60 * 60);
      const intensityChange = parseFloat(latest.intensity) - parseFloat(earliest.intensity);
      const momentum = timeDiffHours > 0 ? intensityChange / timeDiffHours : 0;

      // Determine trajectory
      let trajectory: 'escalating' | 'de-escalating' | 'stable';
      if (intensityChange > 0.2) {
        trajectory = 'escalating';
      } else if (intensityChange < -0.2) {
        trajectory = 'de-escalating';
      } else {
        trajectory = 'stable';
      }

      // Determine discovery potential
      let discoveryPotential: 'high' | 'medium' | 'low';
      if (avgWonder > 0.7 && avgIntensity > 0.6) {
        discoveryPotential = 'high';
      } else if (avgWonder > 0.5 || avgIntensity > 0.7) {
        discoveryPotential = 'medium';
      } else {
        discoveryPotential = 'low';
      }

      return {
        currentEmotion: latest.dominantEmotion,
        currentIntensity: parseFloat(latest.intensity),
        currentWonder: parseFloat(latest.wonderIndex),
        trajectory,
        momentum,
        averageIntensity: avgIntensity,
        averageWonder: avgWonder,
        averageValence: avgValence,
        emotionalVolatility: volatility,
        discoveryPotential,
        windowHours,
        dataPointCount: trajectories.length,
      };
    } catch (error) {
      this.logger.error("[TrajectoryService] Failed to track momentum", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return null;
    }
  }
}

/**
 * Similar Emotional Moment
 * Result from vector similarity search
 */
export interface SimilarEmotionalMoment {
  memoryId: string;
  similarity: number;
  emotion: string;
  intensity: number;
  timestamp: Date;
  tags: string[];
  context?: string;
}
