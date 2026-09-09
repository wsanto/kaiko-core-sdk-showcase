import { injectable, inject } from "tsyringe";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, gte, lte, avg, sql } from "drizzle-orm";
import { Logger } from "winston";
import {
  emotionTrajectory,
  EmotionTrajectory,
} from "../../db";
import {
  GrowthDimension,
  GrowthIndicator,
  GrowthInsights,
} from "./types.v2";

/**
 * Growth Tracking Service
 *
 * Measures emotional intelligence growth across 5 dimensions.
 * Ported from: anima_agentkit/emotional_trend_analyzer.py measure_growth()
 *
 * Phase 3.1: Growth Tracking
 */
@injectable()
export class GrowthTrackingService {
  constructor(
    @inject("DB") private database: NodePgDatabase,
    @inject("LOGGER") private logger: Logger
  ) {}

  /**
   * Measure growth across all 5 dimensions
   *
   * Compares recent period (last 30 days) with historical period (31-60 days ago)
   * to identify emotional intelligence growth.
   *
   * @param userId - User identifier
   * @param recentDays - Days for recent period (default: 30)
   * @param historicalDays - Days for historical period (default: 30)
   * @returns GrowthInsights or null if insufficient data
   */
  async measureGrowth(
    userId: string,
    recentDays: number = 30,
    historicalDays: number = 30
  ): Promise<GrowthInsights | null> {
    try {
      this.logger.debug("[GrowthTrackingService] measureGrowth called", {
        userId,
        recentDays,
        historicalDays,
      });

      const now = new Date();

      // Calculate time periods
      const recentEnd = now;
      const recentStart = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
      const historicalEnd = recentStart;
      const historicalStart = new Date(
        historicalEnd.getTime() - historicalDays * 24 * 60 * 60 * 1000
      );

      // Fetch recent data
      const recentData = await this.database
        .select()
        .from(emotionTrajectory)
        .where(
          and(
            eq(emotionTrajectory.userId, userId),
            gte(emotionTrajectory.timestamp, recentStart),
            lte(emotionTrajectory.timestamp, recentEnd)
          )
        )
        .orderBy(emotionTrajectory.timestamp);

      // Fetch historical data
      const historicalData = await this.database
        .select()
        .from(emotionTrajectory)
        .where(
          and(
            eq(emotionTrajectory.userId, userId),
            gte(emotionTrajectory.timestamp, historicalStart),
            lte(emotionTrajectory.timestamp, historicalEnd)
          )
        )
        .orderBy(emotionTrajectory.timestamp);

      // Check minimum data requirements
      if (recentData.length < 5 || historicalData.length < 5) {
        this.logger.warn(
          "[GrowthTrackingService] Insufficient data for growth tracking",
          {
            userId,
            recentCount: recentData.length,
            historicalCount: historicalData.length,
          }
        );
        return null;
      }

      // Measure growth across all 5 dimensions
      const dimensions: GrowthIndicator[] = [];

      dimensions.push(
        await this.measureRegulationGrowth(recentData, historicalData)
      );
      dimensions.push(
        await this.measureAwarenessGrowth(recentData, historicalData)
      );
      dimensions.push(
        await this.measureVulnerabilityGrowth(recentData, historicalData)
      );
      dimensions.push(
        await this.measureResilienceGrowth(recentData, historicalData)
      );
      dimensions.push(
        await this.measureComplexityGrowth(recentData, historicalData)
      );

      // Calculate overall metrics
      const overallGrowthScore =
        dimensions.reduce((sum, d) => sum + d.percentageChange, 0) /
        dimensions.length;
      const dimensionsGrowing = dimensions.filter((d) => d.isGrowing).length;
      const dimensionsDecline = dimensions.filter(
        (d) => d.percentageChange < 0
      ).length;

      // Generate summary
      const summary = this.generateGrowthSummary(
        dimensionsGrowing,
        dimensionsDecline,
        overallGrowthScore
      );

      const insights: GrowthInsights = {
        comparisonWindow: {
          recent: {
            start: recentStart,
            end: recentEnd,
            dataPoints: recentData.length,
          },
          historical: {
            start: historicalStart,
            end: historicalEnd,
            dataPoints: historicalData.length,
          },
        },
        dimensions,
        overallGrowthScore,
        dimensionsGrowing,
        dimensionsDecline,
        summary,
      };

      this.logger.info("[GrowthTrackingService] measureGrowth success", {
        userId,
        overallGrowthScore,
        dimensionsGrowing,
        dimensionsDecline,
      });

      return insights;
    } catch (err: unknown) {
      this.logger.error("[GrowthTrackingService] measureGrowth failed", {
        userId,
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Failed to measure growth: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  /**
   * Measure REGULATION growth
   *
   * Tracks emotional volatility reduction (emotional stability improvement).
   * Growth threshold: 20% reduction in volatility.
   *
   * Based on: _measure_regulation_growth() in emotional_trend_analyzer.py
   */
  private async measureRegulationGrowth(
    recentData: EmotionTrajectory[],
    historicalData: EmotionTrajectory[]
  ): Promise<GrowthIndicator> {
    const threshold = -20; // 20% reduction = growth

    // Calculate volatility (standard deviation of intensity)
    const recentVolatility = this.calculateVolatility(
      recentData.map((d) => parseFloat(d.intensity))
    );
    const historicalVolatility = this.calculateVolatility(
      historicalData.map((d) => parseFloat(d.intensity))
    );

    // Percentage change (negative = volatility reduction = improvement)
    const percentageChange =
      historicalVolatility === 0
        ? 0
        : ((recentVolatility - historicalVolatility) / historicalVolatility) *
          100;

    const isGrowing = percentageChange <= threshold; // Negative change = improvement

    return {
      dimension: GrowthDimension.REGULATION,
      percentageChange: Math.round(percentageChange * 100) / 100,
      recentValue: Math.round(recentVolatility * 100) / 100,
      historicalValue: Math.round(historicalVolatility * 100) / 100,
      threshold,
      isGrowing,
      description: isGrowing
        ? `Emotional regulation improved: ${Math.abs(Math.round(percentageChange))}% reduction in volatility`
        : `Emotional volatility ${percentageChange > 0 ? "increased" : "stable"}: ${Math.abs(Math.round(percentageChange))}% change`,
    };
  }

  /**
   * Measure AWARENESS growth
   *
   * Tracks increase in emotional complexity (more nuanced emotional understanding).
   * Growth threshold: 15% increase in complexity score.
   *
   * Based on: _measure_awareness_growth() in emotional_trend_analyzer.py
   */
  private async measureAwarenessGrowth(
    recentData: EmotionTrajectory[],
    historicalData: EmotionTrajectory[]
  ): Promise<GrowthIndicator> {
    const threshold = 15; // 15% increase = growth

    // Map complexity to numeric scores
    const complexityScore = (complexity: string): number => {
      switch (complexity) {
        case "simple":
          return 1;
        case "layered":
          return 2;
        case "paradoxical":
          return 3;
        case "transcendent":
          return 4;
        default:
          return 1;
      }
    };

    const recentComplexity =
      recentData.reduce((sum, d) => sum + complexityScore(d.complexity), 0) /
      recentData.length;
    const historicalComplexity =
      historicalData.reduce(
        (sum, d) => sum + complexityScore(d.complexity),
        0
      ) / historicalData.length;

    const percentageChange =
      historicalComplexity === 0
        ? 0
        : ((recentComplexity - historicalComplexity) / historicalComplexity) *
          100;

    const isGrowing = percentageChange >= threshold;

    return {
      dimension: GrowthDimension.AWARENESS,
      percentageChange: Math.round(percentageChange * 100) / 100,
      recentValue: Math.round(recentComplexity * 100) / 100,
      historicalValue: Math.round(historicalComplexity * 100) / 100,
      threshold,
      isGrowing,
      description: isGrowing
        ? `Emotional awareness grew: ${Math.round(percentageChange)}% increase in complexity`
        : `Emotional complexity ${percentageChange > 0 ? "increased slightly" : "stable"}: ${Math.abs(Math.round(percentageChange))}% change`,
    };
  }

  /**
   * Measure VULNERABILITY growth
   *
   * Tracks increase in emotional openness (more vulnerable emotions expressed).
   * Growth threshold: 25% increase in openness frequency.
   *
   * Openness emotions: sadness, fear, anxiety, grief, loneliness
   *
   * Based on: _measure_vulnerability_growth() in emotional_trend_analyzer.py
   */
  private async measureVulnerabilityGrowth(
    recentData: EmotionTrajectory[],
    historicalData: EmotionTrajectory[]
  ): Promise<GrowthIndicator> {
    const threshold = 25; // 25% increase = growth

    const vulnerableEmotions = [
      "sadness",
      "fear",
      "anxiety",
      "grief",
      "loneliness",
    ];

    const recentOpenness =
      recentData.filter((d) =>
        vulnerableEmotions.includes(d.dominantEmotion.toLowerCase())
      ).length / recentData.length;
    const historicalOpenness =
      historicalData.filter((d) =>
        vulnerableEmotions.includes(d.dominantEmotion.toLowerCase())
      ).length / historicalData.length;

    const percentageChange =
      historicalOpenness === 0
        ? 0
        : ((recentOpenness - historicalOpenness) / historicalOpenness) * 100;

    const isGrowing = percentageChange >= threshold;

    return {
      dimension: GrowthDimension.VULNERABILITY,
      percentageChange: Math.round(percentageChange * 100) / 100,
      recentValue: Math.round(recentOpenness * 10000) / 100, // Convert to percentage
      historicalValue: Math.round(historicalOpenness * 10000) / 100,
      threshold,
      isGrowing,
      description: isGrowing
        ? `Emotional openness increased: ${Math.round(percentageChange)}% more vulnerable emotions expressed`
        : `Vulnerability expression ${percentageChange > 0 ? "increased slightly" : "stable"}: ${Math.abs(Math.round(percentageChange))}% change`,
    };
  }

  /**
   * Measure RESILIENCE growth
   *
   * Tracks improvement in emotional recovery speed (faster bounce-back from negative emotions).
   * Growth threshold: 20% faster recovery time.
   *
   * Based on: recovery patterns in emotional_trend_analyzer.py
   */
  private async measureResilienceGrowth(
    recentData: EmotionTrajectory[],
    historicalData: EmotionTrajectory[]
  ): Promise<GrowthIndicator> {
    const threshold = -20; // 20% reduction in recovery time = improvement

    // Calculate average recovery time (negative -> positive valence)
    const recentRecoveryTime = this.calculateAverageRecoveryTime(recentData);
    const historicalRecoveryTime =
      this.calculateAverageRecoveryTime(historicalData);

    const percentageChange =
      historicalRecoveryTime === 0
        ? 0
        : ((recentRecoveryTime - historicalRecoveryTime) /
            historicalRecoveryTime) *
          100;

    const isGrowing = percentageChange <= threshold; // Negative change = faster recovery = improvement

    return {
      dimension: GrowthDimension.RESILIENCE,
      percentageChange: Math.round(percentageChange * 100) / 100,
      recentValue: Math.round(recentRecoveryTime),
      historicalValue: Math.round(historicalRecoveryTime),
      threshold,
      isGrowing,
      description: isGrowing
        ? `Emotional resilience improved: ${Math.abs(Math.round(percentageChange))}% faster recovery`
        : `Recovery speed ${percentageChange > 0 ? "decreased" : "stable"}: ${Math.abs(Math.round(percentageChange))}% change`,
    };
  }

  /**
   * Measure COMPLEXITY growth
   *
   * Tracks growth in emotional nuance (more sophisticated emotional expression).
   * Measured by wonder index and discovery level improvements.
   * Growth threshold: 15% increase in wonder index.
   *
   * Based on: emotional_trend_analyzer.py wonder and discovery tracking
   */
  private async measureComplexityGrowth(
    recentData: EmotionTrajectory[],
    historicalData: EmotionTrajectory[]
  ): Promise<GrowthIndicator> {
    const threshold = 15; // 15% increase = growth

    const recentWonder =
      recentData.reduce((sum, d) => sum + parseFloat(d.wonderIndex), 0) /
      recentData.length;
    const historicalWonder =
      historicalData.reduce((sum, d) => sum + parseFloat(d.wonderIndex), 0) /
      historicalData.length;

    const percentageChange =
      historicalWonder === 0
        ? 0
        : ((recentWonder - historicalWonder) / historicalWonder) * 100;

    const isGrowing = percentageChange >= threshold;

    return {
      dimension: GrowthDimension.COMPLEXITY,
      percentageChange: Math.round(percentageChange * 100) / 100,
      recentValue: Math.round(recentWonder * 100) / 100,
      historicalValue: Math.round(historicalWonder * 100) / 100,
      threshold,
      isGrowing,
      description: isGrowing
        ? `Emotional complexity grew: ${Math.round(percentageChange)}% increase in wonder index`
        : `Wonder index ${percentageChange > 0 ? "increased slightly" : "stable"}: ${Math.abs(Math.round(percentageChange))}% change`,
    };
  }

  /**
   * Calculate volatility (standard deviation)
   */
  private calculateVolatility(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      values.length;

    return Math.sqrt(variance);
  }

  /**
   * Calculate average recovery time from negative to positive valence
   *
   * @returns Average recovery time in minutes
   */
  private calculateAverageRecoveryTime(data: EmotionTrajectory[]): number {
    if (data.length < 2) return 0;

    const recoveries: number[] = [];
    let negativeStartIndex: number | null = null;

    for (let i = 0; i < data.length; i++) {
      const valence = parseFloat(data[i].valence);

      if (valence < 0 && negativeStartIndex === null) {
        // Start of negative period
        negativeStartIndex = i;
      } else if (valence > 0 && negativeStartIndex !== null) {
        // Recovery detected
        const recoveryTime =
          (data[i].timestamp.getTime() -
            data[negativeStartIndex].timestamp.getTime()) /
          (1000 * 60); // Convert to minutes
        recoveries.push(recoveryTime);
        negativeStartIndex = null;
      }
    }

    if (recoveries.length === 0) return 0;

    return recoveries.reduce((sum, t) => sum + t, 0) / recoveries.length;
  }

  /**
   * Generate human-readable growth summary
   */
  private generateGrowthSummary(
    dimensionsGrowing: number,
    dimensionsDecline: number,
    overallScore: number
  ): string {
    if (dimensionsGrowing >= 4) {
      return "Excellent emotional growth across multiple dimensions";
    } else if (dimensionsGrowing >= 3) {
      return "Strong emotional growth in most areas";
    } else if (dimensionsGrowing >= 2) {
      return "Moderate emotional growth detected";
    } else if (dimensionsGrowing === 1) {
      return "Some emotional growth detected";
    } else if (overallScore > 5) {
      return "Slight positive trend in emotional development";
    } else if (overallScore < -5) {
      return "Emotional patterns show need for attention";
    } else {
      return "Emotional patterns remain stable";
    }
  }
}
