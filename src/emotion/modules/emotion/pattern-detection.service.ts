import { injectable, inject } from "tsyringe";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Logger } from "winston";
import { emotionTrajectory, emotionPatterns } from "../../db";

/**
 * Pattern Types
 * Reference: anima_agentkit/emotional_trend_analyzer.py PatternType
 */
export enum PatternType {
  TEMPORAL = "temporal",       // Time-based patterns (e.g., "Monday anxiety")
  TRIGGER_BASED = "trigger_based", // Event-triggered reactions
  CYCLICAL = "cyclical",       // Repeating emotional cycles
  SEQUENTIAL = "sequential",   // One emotion leads to another
  RECOVERY = "recovery",       // Bounce-back patterns (resilience)
}

/**
 * Detected Pattern
 */
export interface DetectedPattern {
  patternId: string;
  patternType: PatternType;
  name: string;
  description: string;
  trigger?: string;
  emotionalSequence: string[];
  frequency: number;
  confidence: number;
  lastOccurrence: Date;
  firstDetected: Date;
  typicalDuration?: number;    // Minutes
  typicalIntensity?: number;   // 0-1
}

/**
 * Emotion Trajectory type for pattern detection
 */
interface EmotionTrajectory {
  id: string;
  userId: string;
  dominantEmotion: string;
  intensity: string;
  timestamp: Date;
  metadata?: any;
}

/**
 * Pattern Detection Service
 *
 * Implements 5 pattern detection algorithms:
 * 1. Temporal: Time-based patterns (day/time)
 * 2. Trigger-based: Event-triggered reactions
 * 3. Cyclical: Repeating emotional cycles
 * 4. Sequential: Emotion transition patterns
 * 5. Recovery: Resilience patterns (negative → positive)
 */
@injectable()
export class PatternDetectionService {
  constructor(
    @inject("DB") private database: NodePgDatabase,
    @inject("LOGGER") private logger: Logger
  ) {}

  /**
   * Detect all pattern types for a user
   * Reference: emotional_trend_analyzer.py analyze_patterns()
   */
  async detectPatterns(
    userId: string,
    days: number = 30,
    minFrequency: number = 3
  ): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    try {
      // Detect each pattern type
      const temporal = await this.detectTemporalPatterns(userId, days, minFrequency);
      const triggerBased = await this.detectTriggerPatterns(userId, days, minFrequency);
      const cyclical = await this.detectCyclicalPatterns(userId, days, minFrequency);
      const sequential = await this.detectSequentialPatterns(userId, days, minFrequency);
      const recovery = await this.detectRecoveryPatterns(userId, days, minFrequency);

      patterns.push(...temporal, ...triggerBased, ...cyclical, ...sequential, ...recovery);

      // Store new patterns in database
      await this.storePatterns(userId, patterns);

      this.logger.debug("[PatternDetectionService] Pattern detection complete", {
        userId,
        totalPatterns: patterns.length,
        temporal: temporal.length,
        triggerBased: triggerBased.length,
        cyclical: cyclical.length,
        sequential: sequential.length,
        recovery: recovery.length,
      });
    } catch (error) {
      this.logger.error("[PatternDetectionService] Pattern detection failed", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    }

    return patterns;
  }

  /**
   * Detect temporal patterns (time-based)
   * Example: "Anxiety spikes every Monday morning"
   */
  private async detectTemporalPatterns(
    userId: string,
    days: number,
    minFrequency: number
  ): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get trajectories
    const trajectories = await this.database
      .select()
      .from(emotionTrajectory)
      .where(
        and(
          eq(emotionTrajectory.userId, userId),
          gte(emotionTrajectory.timestamp, startDate)
        )
      )
      .orderBy(emotionTrajectory.timestamp);

    // Group by day of week + time of day
    const dayTimeMap: Record<string, EmotionTrajectory[]> = {};

    for (const trajectory of trajectories) {
      const date = new Date(trajectory.timestamp);
      const dayOfWeek = date.getDay(); // 0-6
      const hour = date.getHours(); // 0-23

      // Create key: "Monday-Morning", "Tuesday-Afternoon", etc.
      const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];
      const timeOfDay = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
      const key = `${dayName}-${timeOfDay}`;

      if (!dayTimeMap[key]) dayTimeMap[key] = [];
      dayTimeMap[key].push(trajectory as EmotionTrajectory);
    }

    // Analyze each time slot for patterns
    for (const [timeSlot, occurrences] of Object.entries(dayTimeMap)) {
      if (occurrences.length < minFrequency) continue;

      // Find dominant emotion in this time slot
      const emotionCounts: Record<string, number> = {};
      let totalIntensity = 0;

      for (const occurrence of occurrences) {
        const emotion = occurrence.dominantEmotion;
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
        totalIntensity += parseFloat(occurrence.intensity);
      }

      // Get most frequent emotion
      const dominantEmotion = Object.entries(emotionCounts)
        .sort(([, a], [, b]) => b - a)[0];

      if (dominantEmotion && dominantEmotion[1] >= minFrequency) {
        const confidence = dominantEmotion[1] / occurrences.length;
        const avgIntensity = totalIntensity / occurrences.length;

        patterns.push({
          patternId: `temporal-${userId}-${timeSlot}`,
          patternType: PatternType.TEMPORAL,
          name: `${timeSlot} ${dominantEmotion[0]}`,
          description: `Tends to feel ${dominantEmotion[0]} on ${timeSlot.replace("-", " ")}`,
          trigger: timeSlot,
          emotionalSequence: [dominantEmotion[0]],
          frequency: dominantEmotion[1],
          confidence,
          lastOccurrence: occurrences[occurrences.length - 1].timestamp,
          firstDetected: occurrences[0].timestamp,
          typicalIntensity: avgIntensity,
        });
      }
    }

    return patterns;
  }

  /**
   * Detect trigger-based patterns
   * Example: "After work meetings, feels frustrated"
   */
  private async detectTriggerPatterns(
    userId: string,
    days: number,
    minFrequency: number
  ): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get trajectories with metadata triggers
    const trajectories = await this.database
      .select()
      .from(emotionTrajectory)
      .where(
        and(
          eq(emotionTrajectory.userId, userId),
          gte(emotionTrajectory.timestamp, startDate),
          sql`${emotionTrajectory.metadata}->>'trigger' IS NOT NULL`
        )
      )
      .orderBy(emotionTrajectory.timestamp);

    // Group by trigger
    const triggerMap: Record<string, EmotionTrajectory[]> = {};

    for (const trajectory of trajectories) {
      const trigger = (trajectory.metadata as any)?.trigger;
      if (!trigger) continue;

      if (!triggerMap[trigger]) triggerMap[trigger] = [];
      triggerMap[trigger].push(trajectory as EmotionTrajectory);
    }

    // Analyze each trigger
    for (const [trigger, occurrences] of Object.entries(triggerMap)) {
      if (occurrences.length < minFrequency) continue;

      // Find dominant emotion after this trigger
      const emotionCounts: Record<string, number> = {};
      let totalIntensity = 0;

      for (const occurrence of occurrences) {
        const emotion = occurrence.dominantEmotion;
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
        totalIntensity += parseFloat(occurrence.intensity);
      }

      const dominantEmotion = Object.entries(emotionCounts)
        .sort(([, a], [, b]) => b - a)[0];

      if (dominantEmotion && dominantEmotion[1] >= minFrequency) {
        const confidence = dominantEmotion[1] / occurrences.length;
        const avgIntensity = totalIntensity / occurrences.length;

        patterns.push({
          patternId: `trigger-${userId}-${trigger}`,
          patternType: PatternType.TRIGGER_BASED,
          name: `${trigger} → ${dominantEmotion[0]}`,
          description: `After "${trigger}", tends to feel ${dominantEmotion[0]}`,
          trigger,
          emotionalSequence: [dominantEmotion[0]],
          frequency: dominantEmotion[1],
          confidence,
          lastOccurrence: occurrences[occurrences.length - 1].timestamp,
          firstDetected: occurrences[0].timestamp,
          typicalIntensity: avgIntensity,
        });
      }
    }

    return patterns;
  }

  /**
   * Detect cyclical patterns
   * Example: "Joy → Sadness → Joy cycle every 2 weeks"
   */
  private async detectCyclicalPatterns(
    userId: string,
    days: number,
    minFrequency: number
  ): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get trajectories
    const trajectories = await this.database
      .select()
      .from(emotionTrajectory)
      .where(
        and(
          eq(emotionTrajectory.userId, userId),
          gte(emotionTrajectory.timestamp, startDate)
        )
      )
      .orderBy(emotionTrajectory.timestamp);

    if (trajectories.length < 10) return patterns; // Need sufficient data

    // Look for repeating emotional sequences
    const emotionSequence = trajectories.map((t) => t.dominantEmotion);
    const windowSize = 3; // Look for 3-emotion cycles

    // Find repeating subsequences
    const sequenceCounts: Record<string, { count: number; indices: number[] }> = {};

    for (let i = 0; i <= emotionSequence.length - windowSize; i++) {
      const subseq = emotionSequence.slice(i, i + windowSize).join("→");

      if (!sequenceCounts[subseq]) {
        sequenceCounts[subseq] = { count: 0, indices: [] };
      }
      sequenceCounts[subseq].count++;
      sequenceCounts[subseq].indices.push(i);
    }

    // Identify significant cycles
    for (const [sequence, data] of Object.entries(sequenceCounts)) {
      if (data.count < minFrequency) continue;

      // Calculate average time between cycles
      const intervals: number[] = [];
      for (let i = 1; i < data.indices.length; i++) {
        const time1 = trajectories[data.indices[i - 1]].timestamp;
        const time2 = trajectories[data.indices[i]].timestamp;
        intervals.push(time2.getTime() - time1.getTime());
      }

      const avgInterval = intervals.length > 0
        ? intervals.reduce((a, b) => a + b, 0) / intervals.length
        : 0;

      const emotions = sequence.split("→");
      const confidence = data.count / (emotionSequence.length - windowSize + 1);

      patterns.push({
        patternId: `cyclical-${userId}-${sequence}`,
        patternType: PatternType.CYCLICAL,
        name: `${sequence} cycle`,
        description: `Repeating emotional cycle: ${sequence}`,
        emotionalSequence: emotions,
        frequency: data.count,
        confidence,
        lastOccurrence: trajectories[data.indices[data.indices.length - 1]].timestamp,
        firstDetected: trajectories[data.indices[0]].timestamp,
        typicalDuration: Math.round(avgInterval / 60000), // Convert to minutes
      });
    }

    return patterns;
  }

  /**
   * Detect sequential patterns
   * Example: "Anger often leads to Sadness within 2 hours"
   */
  private async detectSequentialPatterns(
    userId: string,
    days: number,
    minFrequency: number
  ): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get trajectories
    const trajectories = await this.database
      .select()
      .from(emotionTrajectory)
      .where(
        and(
          eq(emotionTrajectory.userId, userId),
          gte(emotionTrajectory.timestamp, startDate)
        )
      )
      .orderBy(emotionTrajectory.timestamp);

    if (trajectories.length < 5) return patterns;

    // Track emotion transitions
    const transitions: Record<string, { count: number; avgDuration: number; durations: number[] }> = {};

    for (let i = 0; i < trajectories.length - 1; i++) {
      const current = trajectories[i];
      const next = trajectories[i + 1];

      const transition = `${current.dominantEmotion}→${next.dominantEmotion}`;
      const duration = (next.timestamp.getTime() - current.timestamp.getTime()) / 60000; // minutes

      if (!transitions[transition]) {
        transitions[transition] = { count: 0, avgDuration: 0, durations: [] };
      }

      transitions[transition].count++;
      transitions[transition].durations.push(duration);
    }

    // Analyze transitions
    for (const [transition, data] of Object.entries(transitions)) {
      if (data.count < minFrequency) continue;

      const [from, to] = transition.split("→");
      const avgDuration = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
      const confidence = data.count / (trajectories.length - 1);

      patterns.push({
        patternId: `sequential-${userId}-${transition}`,
        patternType: PatternType.SEQUENTIAL,
        name: `${from} → ${to}`,
        description: `${from} often leads to ${to} within ${Math.round(avgDuration)} minutes`,
        emotionalSequence: [from, to],
        frequency: data.count,
        confidence,
        lastOccurrence: trajectories[trajectories.length - 1].timestamp,
        firstDetected: trajectories[0].timestamp,
        typicalDuration: Math.round(avgDuration),
      });
    }

    return patterns;
  }

  /**
   * Detect recovery patterns (resilience)
   * Example: "Recovers from Sadness to Joy in 30 minutes"
   */
  private async detectRecoveryPatterns(
    userId: string,
    days: number,
    minFrequency: number
  ): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get trajectories
    const trajectories = await this.database
      .select()
      .from(emotionTrajectory)
      .where(
        and(
          eq(emotionTrajectory.userId, userId),
          gte(emotionTrajectory.timestamp, startDate)
        )
      )
      .orderBy(emotionTrajectory.timestamp);

    if (trajectories.length < 5) return patterns;

    // Track recovery transitions (negative → positive)
    const negativeEmotions = ["sadness", "anger", "fear", "disgust"];
    const positiveEmotions = ["joy", "surprise", "trust", "anticipation"];

    const recoveries: Array<{
      from: string;
      to: string;
      duration: number;
      timestamp: Date;
    }> = [];

    for (let i = 0; i < trajectories.length - 1; i++) {
      const current = trajectories[i];
      const next = trajectories[i + 1];

      if (
        negativeEmotions.includes(current.dominantEmotion) &&
        positiveEmotions.includes(next.dominantEmotion)
      ) {
        const duration = (next.timestamp.getTime() - current.timestamp.getTime()) / 60000;
        recoveries.push({
          from: current.dominantEmotion,
          to: next.dominantEmotion,
          duration,
          timestamp: next.timestamp,
        });
      }
    }

    if (recoveries.length >= minFrequency) {
      // Group by from-to emotion
      const recoveryMap: Record<string, typeof recoveries> = {};
      for (const recovery of recoveries) {
        const key = `${recovery.from}→${recovery.to}`;
        if (!recoveryMap[key]) recoveryMap[key] = [];
        recoveryMap[key].push(recovery);
      }

      for (const [transition, data] of Object.entries(recoveryMap)) {
        if (data.length < minFrequency) continue;

        const [from, to] = transition.split("→");
        const avgDur = data.reduce((sum, r) => sum + r.duration, 0) / data.length;

        patterns.push({
          patternId: `recovery-${userId}-${transition}`,
          patternType: PatternType.RECOVERY,
          name: `Recovery: ${from} → ${to}`,
          description: `Recovers from ${from} to ${to} in ~${Math.round(avgDur)} minutes`,
          emotionalSequence: [from, to],
          frequency: data.length,
          confidence: data.length / recoveries.length,
          lastOccurrence: data[data.length - 1].timestamp,
          firstDetected: data[0].timestamp,
          typicalDuration: Math.round(avgDur),
        });
      }
    }

    return patterns;
  }

  /**
   * Store patterns in database
   */
  private async storePatterns(userId: string, patterns: DetectedPattern[]): Promise<void> {
    for (const pattern of patterns) {
      try {
        // Check if pattern already exists
        const existing = await this.database
          .select()
          .from(emotionPatterns)
          .where(eq(emotionPatterns.patternId, pattern.patternId))
          .limit(1);

        if (existing.length > 0) {
          // Update existing pattern
          await this.database
            .update(emotionPatterns)
            .set({
              frequency: pattern.frequency,
              confidence: pattern.confidence,
              lastOccurrence: pattern.lastOccurrence,
              typicalDuration: pattern.typicalDuration,
              typicalIntensity: pattern.typicalIntensity,
            })
            .where(eq(emotionPatterns.patternId, pattern.patternId));
        } else {
          // Insert new pattern
          await this.database.insert(emotionPatterns).values({
            patternId: pattern.patternId,
            userId,
            patternType: pattern.patternType,
            patternName: pattern.name,
            description: pattern.description,
            trigger: pattern.trigger,
            emotionalSequence: pattern.emotionalSequence,
            frequency: pattern.frequency,
            confidence: pattern.confidence,
            firstDetected: pattern.firstDetected,
            lastOccurrence: pattern.lastOccurrence,
            typicalDuration: pattern.typicalDuration,
            typicalIntensity: pattern.typicalIntensity,
          });
        }
      } catch (error) {
        this.logger.error("[PatternDetectionService] Failed to store pattern", {
          error: error instanceof Error ? error.message : String(error),
          patternId: pattern.patternId,
        });
      }
    }
  }

  /**
   * Get active patterns for a user
   */
  async getActivePatterns(userId: string, limit: number = 10): Promise<DetectedPattern[]> {
    const records = await this.database
      .select()
      .from(emotionPatterns)
      .where(eq(emotionPatterns.userId, userId))
      .orderBy(desc(emotionPatterns.confidence))
      .limit(limit);

    return records.map((record) => ({
      patternId: record.patternId,
      patternType: record.patternType as PatternType,
      name: record.patternName,
      description: record.description,
      trigger: record.trigger || undefined,
      emotionalSequence: record.emotionalSequence,
      frequency: record.frequency,
      confidence: record.confidence,
      lastOccurrence: record.lastOccurrence,
      firstDetected: record.firstDetected,
      typicalDuration: record.typicalDuration || undefined,
      typicalIntensity: record.typicalIntensity !== null ? record.typicalIntensity : undefined,
    }));
  }
}
