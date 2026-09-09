import { injectable, inject } from "tsyringe";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Logger } from "winston";
import { TrajectoryService } from "./trajectory.service";
import { PatternDetectionService } from "./pattern-detection.service";
import { EmotionalSignatureService, EmotionalSignature } from "./emotional-signature.service";

/**
 * Similar Emotional Moment (Phase 6.6)
 * Represents a past emotional state similar to the current one
 */
export interface SimilarMoment {
  memoryId: string;
  similarity: number;             // 0-1 cosine similarity
  emotion: string;
  intensity: number;
  timestamp: Date;
  tags: string[];
  context?: string;
}

/**
 * Emotional Pattern Summary (Phase 6.6)
 * Simplified pattern data for RAG context
 */
export interface EmotionalPattern {
  patternId: string;
  patternType: string;
  name: string;
  frequency: number;
  confidence: number;
  emotionalSequence: string[];
}

/**
 * RAG Context (Phase 6.6)
 * Complete context for emotionally-aware response generation
 */
export interface EmotionalRAGContext {
  similarMoments: SimilarMoment[];
  patterns: EmotionalPattern[];
  insights: string;
}

/**
 * Emotional RAG Service (Phase 6.6)
 * Retrieves emotionally similar past moments and patterns for context-aware AI responses
 * Reference: anima_agentkit/graphrag/emotional_rag.py
 */
@injectable()
export class EmotionalRAGService {
  constructor(
    @inject("DB") private database: NodePgDatabase,
    @inject("LOGGER") private logger: Logger,
    @inject(TrajectoryService) private trajectoryService: TrajectoryService,
    @inject(PatternDetectionService) private patternDetectionService: PatternDetectionService,
    @inject(EmotionalSignatureService) private signatureService: EmotionalSignatureService
  ) {}

  /**
   * Retrieve emotionally similar context for RAG
   * Finds similar past moments and relevant patterns to enrich AI response
   */
  async retrieveEmotionalContext(
    userId: string,
    currentSignature: EmotionalSignature,
    limit: number = 5
  ): Promise<EmotionalRAGContext> {
    try {
      // Find similar emotional moments using vector similarity
      const similarMoments = await this.trajectoryService.findSimilarEmotionalMoments(
        userId,
        currentSignature.vector,
        0.7,  // 70% similarity threshold
        limit
      );

      // Get active patterns and filter for relevance
      const allPatterns = await this.patternDetectionService.getActivePatterns(userId, 10);
      const relevantPatterns = this.filterRelevantPatterns(
        allPatterns,
        currentSignature.primaryEmotion
      );

      // Generate AI-friendly insights
      const insights = this.generateInsights(similarMoments, relevantPatterns, currentSignature);

      this.logger.debug("[EmotionalRAGService] Retrieved emotional context", {
        userId,
        similarMomentCount: similarMoments.length,
        patternCount: relevantPatterns.length,
      });

      return {
        similarMoments,
        patterns: relevantPatterns,
        insights,
      };
    } catch (error) {
      this.logger.error("[EmotionalRAGService] Failed to retrieve emotional context", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return {
        similarMoments: [],
        patterns: [],
        insights: '',
      };
    }
  }

  /**
   * Filter patterns relevant to current emotion
   * Only returns patterns that include the current emotion in their sequence
   */
  private filterRelevantPatterns(
    patterns: any[],
    currentEmotion: string
  ): EmotionalPattern[] {
    return patterns
      .filter(p => p.emotionalSequence && p.emotionalSequence.includes(currentEmotion))
      .map(p => ({
        patternId: p.patternId,
        patternType: p.patternType,
        name: p.name,
        frequency: p.frequency,
        confidence: p.confidence,
        emotionalSequence: p.emotionalSequence,
      }))
      .slice(0, 5);  // Top 5 most relevant
  }

  /**
   * Generate AI-friendly insights from RAG context
   * Creates a natural language summary for the AI to use
   */
  private generateInsights(
    moments: SimilarMoment[],
    patterns: EmotionalPattern[],
    currentSignature: EmotionalSignature
  ): string {
    const insights: string[] = [];

    // Similar moments insight
    if (moments.length > 0) {
      const avgSimilarity = moments.reduce((sum, m) => sum + m.similarity, 0) / moments.length;
      insights.push(
        `User has experienced similar emotional states ${moments.length} time(s) recently ` +
        `(avg similarity: ${(avgSimilarity * 100).toFixed(0)}%). ` +
        `Most recent: ${moments[0].emotion} on ${moments[0].timestamp.toLocaleDateString()}.`
      );
    }

    // Pattern insights
    if (patterns.length > 0) {
      const highConfidencePatterns = patterns.filter(p => p.confidence >= 0.7);
      if (highConfidencePatterns.length > 0) {
        const patternNames = highConfidencePatterns.map(p => p.name).join(', ');
        insights.push(
          `Detected ${highConfidencePatterns.length} relevant emotional pattern(s): ${patternNames}. ` +
          `Consider these patterns when shaping your response.`
        );
      }
    }

    // Emotional state insight
    if (currentSignature.discoveryLevel === 'breakthrough' || currentSignature.discoveryLevel === 'transcendent') {
      insights.push(
        `Current state is a ${currentSignature.discoveryLevel} moment. ` +
        `This is significant - acknowledge and explore this experience deeply.`
      );
    }

    // Return combined insights or empty string
    return insights.length > 0 ? insights.join(' ') : '';
  }
}
