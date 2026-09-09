import { UsageLogHelpers } from "@shared/helpers/usage_log";
import { QueuePublisher } from "@shared/services/sqs.publisher";
import { UsageLogPayloadBody } from "@shared/types/usage_log.payload";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { EmotionClassificationService } from "./emotion-classification.service";
import { EQAnalysisService } from "./eq-analysis.service";
import { TrajectoryService, TimeWindow } from "./trajectory.service";
import { GrowthTrackingService } from "./growth-tracking.service";
import { ConversationModeService } from "./conversation-mode.service";
import { BeliefDetectionService } from "../belief/belief-detection.service";
import { EmotionalSignatureService } from "./emotional-signature.service";
import { PatternDetectionService } from "./pattern-detection.service";
import { HostilityTrackingService } from "./hostility-tracking.service";
import { PersonalityModeService } from "./personality-mode.service";
import { EmotionalRAGService } from "./emotional-rag.service";
import { AnalyseEmotionBody } from "./types";
import { AnalysisEmotionResponseV2, StateEmotionResponseV2 } from "./types.v2";

// Request context for usage logging
export interface RequestContext {
  userId: string;
  apiKeyId: string;
  requestId: string;
  projectId: string;
  apiPath: string;
}

/**
 * Emotion Service V2
 *
 * Enhanced emotion analysis service with multi-dimensional EQ features.
 * Uses EQAnalysisService to add 6 new EQ dimensions to emotion responses.
 *
 * Phase 2.1: Integrated with TrajectoryService for emotional tracking and pattern detection.
 * Phase 3.1: Integrated with GrowthTrackingService for growth measurement.
 * Phase 4.1: Integrated with ConversationModeService for context-aware response shaping.
 * Phase 5.2: Integrated with BeliefDetectionService for belief extraction.
 * Phase 6.1: Integrated with EmotionalSignatureService for emotional vector search.
 * Phase 6.2: Integrated with PatternDetectionService for advanced pattern detection.
 * Phase 6.3: Integrated with emotional momentum tracking for crisis prevention.
 * Phase 6.4: Integrated with HostilityTrackingService for safety monitoring and meta-emotional analysis.
 * Phase 6.5: Integrated with PersonalityModeService for intelligent response guidance.
 * Phase 6.6: Integrated with EmotionalRAGService for context-aware response generation.
 */
@autoInjectable()
export default class EmotionServiceV2 extends UsageLogHelpers {
  constructor(
    @inject("DB") private database: NodePgDatabase,
    @inject("LOGGER") private logger: Logger,
    @inject(EmotionClassificationService)
    private classificationService: EmotionClassificationService,
    @inject(EQAnalysisService)
    private eqAnalysis: EQAnalysisService,
    @inject(TrajectoryService)
    private trajectoryService: TrajectoryService,
    @inject(GrowthTrackingService)
    private growthTrackingService: GrowthTrackingService,
    @inject(ConversationModeService)
    private conversationModeService: ConversationModeService,
    @inject(BeliefDetectionService)
    private beliefDetectionService: BeliefDetectionService,
    @inject(EmotionalSignatureService)
    private emotionalSignatureService: EmotionalSignatureService,
    @inject(PatternDetectionService)
    private patternDetectionService: PatternDetectionService,
    @inject(HostilityTrackingService)
    private hostilityTrackingService: HostilityTrackingService,
    @inject(PersonalityModeService)
    private personalityModeService: PersonalityModeService,
    @inject(EmotionalRAGService)
    private emotionalRAGService: EmotionalRAGService,
    @inject("UsageLogQueue") private usageQueue?: QueuePublisher<UsageLogPayloadBody>
  ) {
    super();
  }

  // V2: POST /v2/emotions/:context_id/analysis
  async analyseAndStoreEmotionV2(contextId: string, body: AnalyseEmotionBody, requestContext: RequestContext) {
    try {
      this.logger.debug("[EmotionServiceV2] analyseAndStoreEmotionV2 called", {
        contextId,
        messageCount: body.messages.length,
        userId: requestContext.userId,
      });

      const message = body.messages[0];
      const analysed = await this.classificationService.classify(
        message.content.text
      );

      // Use EQ analysis to enhance the emotion data
      // Pass ML-predicted dimensional values from ensemble sidecar (if available)
      const mlDims = (analysed.dimensionalPredictions?.valence != null) ? analysed.dimensionalPredictions : undefined;
      const emotionItemV2 = this.eqAnalysis.analyzeEmotions(analysed.results, mlDims);

      // Propagate fallback flag so consumers know this is not real ML data
      if (analysed.isFallback) {
        emotionItemV2.isFallback = true;
        this.logger.warn("[EmotionServiceV2] Using circuit-breaker fallback data", {
          contextId,
          userId: requestContext.userId,
        });
      }

      // Phase 6.4: Calculate meta-emotional scores (methods already exist in EQAnalysisService)
      const metaEmotionalScore = this.eqAnalysis.calculateMetaEmotionalScore(analysed.results);
      const patternEmotionScore = this.eqAnalysis.calculatePatternEmotionScore(analysed.results);
      const safetyConcernScore = this.eqAnalysis.calculateSafetyConcernScore(analysed.results);
      const isBreakthrough = this.eqAnalysis.isBreakthroughMoment(analysed.results);

      // Add meta-scores to emotionItemV2
      emotionItemV2.metaEmotionalScore = metaEmotionalScore;
      emotionItemV2.patternEmotionScore = patternEmotionScore;
      emotionItemV2.safetyConcernScore = safetyConcernScore;
      emotionItemV2.isBreakthrough = isBreakthrough;

      // Phase 6.1: Create emotional signature for vector search
      const emotionalSignature = this.emotionalSignatureService.createSignature(
        emotionItemV2,
        message.content.text
      );
      const signatureHash = this.emotionalSignatureService.generateSignatureHash(emotionalSignature);

      // Add signature fields to emotionItemV2 for response
      emotionItemV2.emotionalVector = emotionalSignature.vector;
      emotionItemV2.emotionalTags = emotionalSignature.tags;
      emotionItemV2.emotionalSignature = signatureHash;

      // Phase 2.1: Store trajectory point for tracking emotional changes over time
      // Use authenticated userId from request context
      const userId = requestContext.userId;

      // Phase 6.4: Analyze hostility and track escalation
      const hostilityState = await this.hostilityTrackingService.analyzeHostility(
        userId,
        contextId,
        analysed.results,
        message.content.text
      );

      // Add hostility state to emotionItemV2
      emotionItemV2.hostilityState = hostilityState;

      // Log warning if hostility detected
      if (hostilityState.level !== 'none') {
        this.logger.warn("[EmotionServiceV2] Hostility detected", {
          userId,
          level: hostilityState.level,
          escalationCount: hostilityState.escalationCount,
          recommendedResponse: hostilityState.recommendedResponse,
        });
      }

      let trajectoryInsights;
      try {
        // Phase 3.2: storeTrajectoryPoint now returns memory ID and accepts externalId
        const memoryId = await this.trajectoryService.storeTrajectoryPoint(
          userId,
          emotionItemV2,
          contextId,
          undefined, // externalId not provided in context analysis
          {
            source: "context_analysis",
            text_preview: message.content.text.substring(0, 100),
            emotionalVector: emotionalSignature.vector,
            emotionalTags: emotionalSignature.tags,
            emotionalSignature: signatureHash,
          }
        );

        this.logger.debug("[EmotionServiceV2] Trajectory point stored with memory graduation", {
          userId,
          memoryId,
        });

        // Calculate baseline and detect breakthroughs
        const baseline = await this.trajectoryService.calculateBaseline(userId, TimeWindow.MONTH);
        const trend = await this.trajectoryService.analyzeTrend(userId, TimeWindow.MONTH);
        const breakthrough = baseline ? this.trajectoryService.detectBreakthrough(emotionItemV2, baseline) : { detected: false };

        if (breakthrough.detected) {
          this.logger.info("[EmotionServiceV2] Breakthrough detected!", {
            userId,
            type: breakthrough.type,
            significance: breakthrough.significance,
          });
        }

        // Phase 6.3: Track emotional momentum (last 24 hours)
        const momentum = await this.trajectoryService.trackEmotionalMomentum(userId, 24);

        if (momentum) {
          this.logger.debug("[EmotionServiceV2] Momentum tracked", {
            userId,
            trajectory: momentum.trajectory,
            momentum: momentum.momentum,
            discoveryPotential: momentum.discoveryPotential,
          });

          // Warn on escalating negative emotions (crisis prevention)
          if (momentum.trajectory === 'escalating' && momentum.averageValence < -0.3) {
            this.logger.warn("[EmotionServiceV2] Escalating negative emotions detected", {
              userId,
              currentEmotion: momentum.currentEmotion,
              momentum: momentum.momentum,
              volatility: momentum.emotionalVolatility,
            });
          }
        }

        // Phase 6.6: Retrieve emotional RAG context
        let ragContext;
        try {
          ragContext = await this.emotionalRAGService.retrieveEmotionalContext(
            userId,
            emotionalSignature,
            5  // Limit to top 5 similar moments
          );

          if (ragContext.similarMoments.length > 0 || ragContext.patterns.length > 0) {
            this.logger.info("[EmotionServiceV2] Emotional RAG context retrieved", {
              userId,
              similarMoments: ragContext.similarMoments.length,
              patterns: ragContext.patterns.length,
              hasInsights: !!ragContext.insights,
            });
          }
        } catch (ragError: unknown) {
          this.logger.debug("[EmotionServiceV2] Emotional RAG retrieval failed", {
            error: (ragError instanceof Error ? ragError.message : String(ragError)),
            userId,
          });
        }

        // Build trajectory insights if we have data
        if (baseline || trend || breakthrough.detected || momentum || ragContext) {
          trajectoryInsights = {
            baseline: baseline ? {
              window: "month" as const,
              dataPointCount: baseline.dataPointCount,
              dominantEmotions: baseline.dominantEmotions,
              averageIntensity: baseline.averageIntensity,
              baselineValence: baseline.baselineValence,
              baselineArousal: baseline.baselineArousal,
              emotionalVolatility: baseline.emotionalVolatility,
              averageComplexity: baseline.averageComplexity,
              averageWonderIndex: baseline.averageWonderIndex,
              breakthroughCount: baseline.breakthroughCount,
            } : undefined,
            trend: trend ? {
              direction: trend.direction,
              valenceTrend: trend.valenceTrend,
              intensityTrend: trend.intensityTrend,
              wonderTrend: trend.wonderTrend,
              breakthroughRate: trend.breakthroughRate,
            } : undefined,
            breakthrough: breakthrough.detected ? {
              detected: breakthrough.detected,
              type: breakthrough.type,
              significance: breakthrough.significance,
            } : undefined,
            momentum: momentum || undefined,
            similarMoments: ragContext && (ragContext.similarMoments.length > 0 || ragContext.patterns.length > 0) ? {
              moments: ragContext.similarMoments,
              patterns: ragContext.patterns,
              insights: ragContext.insights,
            } : undefined,
          };
        }
      } catch (trajectoryError: unknown) {
        // Log but don't fail the request if trajectory storage fails
        this.logger.warn("[EmotionServiceV2] Trajectory storage failed", {
          error: (trajectoryError instanceof Error ? trajectoryError.message : String(trajectoryError)),
          userId,
        });
      }

      // Phase 3.1: Measure growth across 5 dimensions
      let growthInsights;
      try {
        growthInsights = await this.growthTrackingService.measureGrowth(userId);
        if (growthInsights) {
          this.logger.info("[EmotionServiceV2] Growth tracking success", {
            userId,
            overallGrowthScore: growthInsights.overallGrowthScore,
            dimensionsGrowing: growthInsights.dimensionsGrowing,
          });
        }
      } catch (growthError: unknown) {
        // Log but don't fail the request if growth tracking fails
        this.logger.debug("[EmotionServiceV2] Growth tracking failed", {
          error: (growthError instanceof Error ? growthError.message : String(growthError)),
          userId,
        });
      }

      // Phase 4.1: Detect conversation mode for context-aware response shaping
      const conversationMode = this.conversationModeService.detectMode(
        emotionItemV2.intensity,
        emotionItemV2.valence,
        message.content.text
      );

      if (conversationMode.crisisDetected) {
        this.logger.warn("[EmotionServiceV2] CRISIS MODE DETECTED", {
          userId,
          contextId,
          mode: conversationMode.mode,
          confidence: conversationMode.confidence,
        });
      } else {
        this.logger.debug("[EmotionServiceV2] Conversation mode detected", {
          userId,
          mode: conversationMode.mode,
          confidence: conversationMode.confidence,
          reasoning: conversationMode.reasoning,
        });
      }

      // Phase 6.5: Detect personality mode for AI response guidance
      const personalityMode = this.personalityModeService.detectMode(
        emotionItemV2,
        message.content.text
      );

      this.logger.debug("[EmotionServiceV2] Personality mode detected", {
        userId,
        mode: personalityMode.mode,
        confidence: personalityMode.confidence,
        reasoning: personalityMode.reasoning,
      });

      // Phase 5.2: Detect beliefs in the message
      const beliefResult = this.beliefDetectionService.detectBeliefs(message.content.text);
      const beliefSummary = this.beliefDetectionService.generateBeliefSummary(message.content.text);

      if (beliefResult.totalBeliefs > 0) {
        this.logger.info("[EmotionServiceV2] Beliefs detected", {
          userId,
          contextId,
          totalBeliefs: beliefResult.totalBeliefs,
          beliefsByType: beliefResult.beliefsByType,
        });
      }

      // Phase 6.2: Detect emotional patterns
      let patternInsights;
      try {
        const patterns = await this.patternDetectionService.detectPatterns(userId, 30, 3);
        const activePatterns = patterns
          .filter(p => p.confidence >= 0.6)
          .map(p => p.patternId);

        if (patterns.length > 0) {
          patternInsights = {
            detected: patterns,
            activePatterns,
            patternSummary: this.generatePatternSummary(patterns),
          };

          this.logger.info("[EmotionServiceV2] Patterns detected", {
            userId,
            contextId,
            patternCount: patterns.length,
            activeCount: activePatterns.length,
          });
        }
      } catch (patternError: unknown) {
        this.logger.debug("[EmotionServiceV2] Pattern detection failed", {
          error: (patternError instanceof Error ? patternError.message : String(patternError)),
          userId,
        });
      }

      const result = {
        object: "emotions.analysis" as const,
        model: "emotion-v2",
        response_type: "per_message" as const,
        isFallback: emotionItemV2.isFallback || false,
        dataQuality: emotionItemV2.isFallback ? "fallback" :
                     (emotionItemV2.dimensionalSource || "ml_predicted"),
        context_id: contextId,
        context_message_count: trajectoryInsights?.baseline?.dataPointCount || 0,
        emotions: { user: emotionItemV2 },
        metadata: {},
        usage: {
          analyse_token: analysed.tokenUsage || 12,
          analyse_token_details: { cached_tokens: 0, audio_tokens: 0 },
        },
        trajectory: trajectoryInsights,
        growth: growthInsights,
        conversationMode: {
          mode: conversationMode.mode,
          confidence: conversationMode.confidence,
          reasoning: conversationMode.reasoning,
          crisisDetected: conversationMode.crisisDetected,
          responseStrategy: this.conversationModeService.getResponseStrategy(conversationMode.mode),
          // Phase 6.5: Personality mode
          personalityMode: personalityMode.mode,
          personalityConfidence: personalityMode.confidence,
          responseGuidance: personalityMode.responseGuidance,
        },
        beliefs: beliefResult.totalBeliefs > 0 ? {
          beliefs: beliefResult.beliefs,
          totalBeliefs: beliefResult.totalBeliefs,
          beliefsByType: beliefResult.beliefsByType,
          summary: beliefSummary,
        } : undefined,
        patterns: patternInsights,
      };

      this.logger.info("[EmotionServiceV2] analyseAndStoreEmotionV2 success", {
        contextId,
        tokenUsage: result.usage.analyse_token,
        complexity: emotionItemV2.complexity,
        discoveryLevel: emotionItemV2.discoveryLevel,
      });

      // Log usage for billing
      const usageLogs: UsageLogPayloadBody[] = [
        this.buildRequestLogs({
          requestId: requestContext.requestId,
          apiKeyId: requestContext.apiKeyId,
          userId: requestContext.userId,
          projectId: requestContext.projectId,
          apiPath: requestContext.apiPath,
          params: { context_id: contextId },
        }),
        this.buildEmotionModelLog({
          requestId: requestContext.requestId,
          apiKeyId: requestContext.apiKeyId,
          userId: requestContext.userId,
          projectId: requestContext.projectId,
          modelName: "emotion-v2",
          tokenUsage: analysed.tokenUsage || 12,
          isContextual: true,
        }),
      ];

      await this.usageQueue?.batchPublish(usageLogs).catch((err) => {
        this.logger.error("[EmotionServiceV2] Error sending usage logs:", err);
      });

      return result;
    } catch (err: unknown) {
      this.logger.error("[EmotionServiceV2] analyseAndStoreEmotionV2 failed", {
        contextId,
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Failed to analyse emotion (V2): ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  // V2: GET /v2/emotions/:context_id
  async getContextEmotionV2(contextId: string): Promise<StateEmotionResponseV2> {
    try {
      this.logger.debug("[EmotionServiceV2] getContextEmotionV2 called", {
        contextId,
      });

      // Mock data for now - in production this would fetch from database
      const mockRawScores = { anger: 0.02, joy: 0.98, sadness: 0.01, fear: 0, love: 0, surprise: 0 };
      const emotionItemV2 = this.eqAnalysis.analyzeEmotions(mockRawScores);

      // Phase 2.1: Try to fetch trajectory insights
      const userId = contextId; // TODO: Extract actual user_id from auth/context
      let trajectoryInsights;

      try {
        const baseline = await this.trajectoryService.calculateBaseline(userId, TimeWindow.MONTH);
        const trend = await this.trajectoryService.analyzeTrend(userId, TimeWindow.MONTH);
        const breakthrough = baseline ? this.trajectoryService.detectBreakthrough(emotionItemV2, baseline) : { detected: false };

        // Phase 6.6: Retrieve emotional RAG context
        let ragContext;
        try {
          // Need emotional signature for RAG
          const emotionalSignature = this.emotionalSignatureService.createSignature(emotionItemV2, '');

          ragContext = await this.emotionalRAGService.retrieveEmotionalContext(
            userId,
            emotionalSignature,
            5  // Limit to top 5 similar moments
          );

          if (ragContext.similarMoments.length > 0 || ragContext.patterns.length > 0) {
            this.logger.info("[EmotionServiceV2] Emotional RAG context retrieved (GET)", {
              userId,
              similarMoments: ragContext.similarMoments.length,
              patterns: ragContext.patterns.length,
              hasInsights: !!ragContext.insights,
            });
          }
        } catch (ragError: unknown) {
          this.logger.debug("[EmotionServiceV2] Emotional RAG retrieval failed (GET)", {
            error: (ragError instanceof Error ? ragError.message : String(ragError)),
            userId,
          });
        }

        // Build trajectory insights if we have data
        if (baseline || trend || breakthrough.detected || ragContext) {
          trajectoryInsights = {
            baseline: baseline ? {
              window: "month" as const,
              dataPointCount: baseline.dataPointCount,
              dominantEmotions: baseline.dominantEmotions,
              averageIntensity: baseline.averageIntensity,
              baselineValence: baseline.baselineValence,
              baselineArousal: baseline.baselineArousal,
              emotionalVolatility: baseline.emotionalVolatility,
              averageComplexity: baseline.averageComplexity,
              averageWonderIndex: baseline.averageWonderIndex,
              breakthroughCount: baseline.breakthroughCount,
            } : undefined,
            trend: trend ? {
              direction: trend.direction,
              valenceTrend: trend.valenceTrend,
              intensityTrend: trend.intensityTrend,
              wonderTrend: trend.wonderTrend,
              breakthroughRate: trend.breakthroughRate,
            } : undefined,
            breakthrough: breakthrough.detected ? {
              detected: breakthrough.detected,
              type: breakthrough.type,
              significance: breakthrough.significance,
            } : undefined,
            similarMoments: ragContext && (ragContext.similarMoments.length > 0 || ragContext.patterns.length > 0) ? {
              moments: ragContext.similarMoments,
              patterns: ragContext.patterns,
              insights: ragContext.insights,
            } : undefined,
          };
        }
      } catch (trajectoryError: unknown) {
        this.logger.debug("[EmotionServiceV2] Trajectory fetch failed for GET context", {
          error: (trajectoryError instanceof Error ? trajectoryError.message : String(trajectoryError)),
          contextId,
        });
      }

      // Phase 3.1: Measure growth
      let growthInsights;
      try {
        growthInsights = await this.growthTrackingService.measureGrowth(userId);
      } catch (growthError: unknown) {
        this.logger.debug("[EmotionServiceV2] Growth tracking failed for GET context", {
          error: (growthError instanceof Error ? growthError.message : String(growthError)),
          contextId,
        });
      }

      const result: StateEmotionResponseV2 = {
        object: "emotions.state" as const,
        model: "emotion-v2",
        emotions: {
          user: emotionItemV2,
        },
        metadata: {
          context_id: contextId,
        },
        usage: {},
        trajectory: trajectoryInsights,
        growth: growthInsights,
      };

      this.logger.info("[EmotionServiceV2] getContextEmotionV2 success", {
        contextId,
        complexity: emotionItemV2.complexity,
      });

      return result;
    } catch (err: unknown) {
      this.logger.error("[EmotionServiceV2] getContextEmotionV2 failed", {
        contextId,
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Failed to get context emotion (V2): ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  // V2: GET /v2/emotions/:context_id/message/:external_id
  async getMessageEmotionV2(contextId: string, externalId: string) {
    try {
      this.logger.debug("[EmotionServiceV2] getMessageEmotionV2 called", {
        contextId,
        externalId,
      });

      // Mock data for now - in production this would fetch from database
      const mockRawScores = { anger: 0.02, joy: 0.98, sadness: 0.01, fear: 0, love: 0, surprise: 0 };
      const emotionItemV2 = this.eqAnalysis.analyzeEmotions(mockRawScores);

      const result = {
        object: "emotions.analysis" as const,
        model: "emotion-v2",
        context_id: contextId,
        external_id: externalId,
        emotions: {
          user: emotionItemV2,
        },
        metadata: {
          context_id: contextId,
          message_id: externalId,
        },
        usage: {
          analyse_token: 0,
          analyse_token_details: { cached_tokens: 0, audio_tokens: 0 },
        },
      };

      this.logger.info("[EmotionServiceV2] getMessageEmotionV2 success", {
        contextId,
        externalId,
        complexity: emotionItemV2.complexity,
      });

      return result;
    } catch (err: unknown) {
      this.logger.error("[EmotionServiceV2] getMessageEmotionV2 failed", {
        contextId,
        externalId,
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Failed to get message emotion (V2): ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  // V2: POST /v2/emotions/analysis (stateless)
  async analyseStatelessEmotionV2(
    body: AnalyseEmotionBody,
    requestContext: RequestContext
  ): Promise<AnalysisEmotionResponseV2> {
    try {
      this.logger.debug("[EmotionServiceV2] analyseStatelessEmotionV2 called", {
        messageCount: body.messages.length,
        userId: requestContext.userId,
      });

      const message = body.messages[0];
      const analysed = await this.classificationService.classify(
        message.content.text
      );

      // Use EQ analysis to enhance the emotion data
      const mlDims2 = (analysed.dimensionalPredictions?.valence != null) ? analysed.dimensionalPredictions : undefined;
      const emotionItemV2 = this.eqAnalysis.analyzeEmotions(analysed.results, mlDims2);

      // Propagate fallback flag so consumers know this is not real ML data
      if (analysed.isFallback) {
        emotionItemV2.isFallback = true;
        this.logger.warn("[EmotionServiceV2] Using circuit-breaker fallback data (stateless)", {
          userId: requestContext.userId,
        });
      }

      // Phase 6.1: Create emotional signature for vector search
      const emotionalSignature = this.emotionalSignatureService.createSignature(
        emotionItemV2,
        message.content.text
      );
      const signatureHash = this.emotionalSignatureService.generateSignatureHash(emotionalSignature);

      // Add signature fields to emotionItemV2 for response
      emotionItemV2.emotionalVector = emotionalSignature.vector;
      emotionItemV2.emotionalTags = emotionalSignature.tags;
      emotionItemV2.emotionalSignature = signatureHash;

      // Phase 2.1: Store trajectory for stateless requests using authenticated userId
      let trajectoryInsights;
      const userId = requestContext.userId;
      if (userId) {
        try {
          // Phase 3.2: storeTrajectoryPoint now returns memory ID and accepts externalId
          const memoryId = await this.trajectoryService.storeTrajectoryPoint(
            userId,
            emotionItemV2,
            undefined, // no contextId for stateless
            (body.params as Record<string, unknown>)?.external_id as string | undefined, // externalId from params if provided
            {
              source: "stateless_analysis",
              text_preview: message.content.text.substring(0, 100),
              emotionalVector: emotionalSignature.vector,
              emotionalTags: emotionalSignature.tags,
              emotionalSignature: signatureHash,
            }
          );

          this.logger.debug("[EmotionServiceV2] Trajectory point stored (stateless) with memory graduation", {
            userId,
            memoryId,
          });

          // Calculate baseline and check for breakthroughs
          const baseline = await this.trajectoryService.calculateBaseline(userId, TimeWindow.MONTH);
          const trend = await this.trajectoryService.analyzeTrend(userId, TimeWindow.MONTH);
          const breakthrough = baseline ? this.trajectoryService.detectBreakthrough(emotionItemV2, baseline) : { detected: false };

          if (breakthrough.detected) {
            this.logger.info("[EmotionServiceV2] Breakthrough detected (stateless)!", {
              userId,
              type: breakthrough.type,
              significance: breakthrough.significance,
            });
          }

          // Phase 6.6: Retrieve emotional RAG context
          let ragContext;
          try {
            ragContext = await this.emotionalRAGService.retrieveEmotionalContext(
              userId,
              emotionalSignature,
              5  // Limit to top 5 similar moments
            );

            if (ragContext.similarMoments.length > 0 || ragContext.patterns.length > 0) {
              this.logger.info("[EmotionServiceV2] Emotional RAG context retrieved (stateless)", {
                userId,
                similarMoments: ragContext.similarMoments.length,
                patterns: ragContext.patterns.length,
                hasInsights: !!ragContext.insights,
              });
            }
          } catch (ragError: unknown) {
            this.logger.debug("[EmotionServiceV2] Emotional RAG retrieval failed (stateless)", {
              error: (ragError instanceof Error ? ragError.message : String(ragError)),
              userId,
            });
          }

          // Build trajectory insights if we have data
          if (baseline || trend || breakthrough.detected || ragContext) {
            trajectoryInsights = {
              baseline: baseline ? {
                window: "month" as const,
                dataPointCount: baseline.dataPointCount,
                dominantEmotions: baseline.dominantEmotions,
                averageIntensity: baseline.averageIntensity,
                baselineValence: baseline.baselineValence,
                baselineArousal: baseline.baselineArousal,
                emotionalVolatility: baseline.emotionalVolatility,
                averageComplexity: baseline.averageComplexity,
                averageWonderIndex: baseline.averageWonderIndex,
                breakthroughCount: baseline.breakthroughCount,
              } : undefined,
              trend: trend ? {
                direction: trend.direction,
                valenceTrend: trend.valenceTrend,
                intensityTrend: trend.intensityTrend,
                wonderTrend: trend.wonderTrend,
                breakthroughRate: trend.breakthroughRate,
              } : undefined,
              breakthrough: breakthrough.detected ? {
                detected: breakthrough.detected,
                type: breakthrough.type,
                significance: breakthrough.significance,
              } : undefined,
              similarMoments: ragContext && (ragContext.similarMoments.length > 0 || ragContext.patterns.length > 0) ? {
                moments: ragContext.similarMoments,
                patterns: ragContext.patterns,
                insights: ragContext.insights,
              } : undefined,
            };
          }
        } catch (trajectoryError: unknown) {
          this.logger.warn("[EmotionServiceV2] Trajectory storage failed (stateless)", {
            error: (trajectoryError instanceof Error ? trajectoryError.message : String(trajectoryError)),
            userId,
          });
        }
      }

      // Phase 3.1: Measure growth using authenticated userId
      let growthInsights;
      if (userId) {
        try {
          growthInsights = await this.growthTrackingService.measureGrowth(userId);
        } catch (growthError: unknown) {
          this.logger.debug("[EmotionServiceV2] Growth tracking failed (stateless)", {
            error: (growthError instanceof Error ? growthError.message : String(growthError)),
            userId,
          });
        }
      }

      // Phase 4.1: Detect conversation mode for context-aware response shaping
      const conversationMode = this.conversationModeService.detectMode(
        emotionItemV2.intensity,
        emotionItemV2.valence,
        message.content.text
      );

      if (conversationMode.crisisDetected) {
        this.logger.warn("[EmotionServiceV2] CRISIS MODE DETECTED (stateless)", {
          mode: conversationMode.mode,
          confidence: conversationMode.confidence,
        });
      } else {
        this.logger.debug("[EmotionServiceV2] Conversation mode detected (stateless)", {
          mode: conversationMode.mode,
          confidence: conversationMode.confidence,
          reasoning: conversationMode.reasoning,
        });
      }

      // Phase 6.5: Detect personality mode for AI response guidance
      const personalityMode = this.personalityModeService.detectMode(
        emotionItemV2,
        message.content.text
      );

      this.logger.debug("[EmotionServiceV2] Personality mode detected (stateless)", {
        mode: personalityMode.mode,
        confidence: personalityMode.confidence,
        reasoning: personalityMode.reasoning,
      });

      // Phase 5.2: Detect beliefs in the message
      const beliefResult = this.beliefDetectionService.detectBeliefs(message.content.text);
      const beliefSummary = this.beliefDetectionService.generateBeliefSummary(message.content.text);

      if (beliefResult.totalBeliefs > 0) {
        this.logger.info("[EmotionServiceV2] Beliefs detected (stateless)", {
          totalBeliefs: beliefResult.totalBeliefs,
          beliefsByType: beliefResult.beliefsByType,
        });
      }

      const result: AnalysisEmotionResponseV2 = {
        object: "emotions.analysis" as const,
        model: "emotion-v2",
        response_type: "per_message" as const,
        isFallback: emotionItemV2.isFallback || false,
        dataQuality: emotionItemV2.isFallback ? "fallback" :
                     (emotionItemV2.dimensionalSource || "ml_predicted"),
        emotions: { _default: emotionItemV2 },
        metadata: {},
        usage: {
          analyse_token: analysed.tokenUsage || 0,
          analyse_token_details: {
            cached_tokens: 0,
            audio_tokens: 0,
          },
        },
        params: body.params ?? {},
        trajectory: trajectoryInsights,
        growth: growthInsights,
        conversationMode: {
          mode: conversationMode.mode,
          confidence: conversationMode.confidence,
          reasoning: conversationMode.reasoning,
          crisisDetected: conversationMode.crisisDetected,
          responseStrategy: this.conversationModeService.getResponseStrategy(conversationMode.mode),
          // Phase 6.5: Personality mode
          personalityMode: personalityMode.mode,
          personalityConfidence: personalityMode.confidence,
          responseGuidance: personalityMode.responseGuidance,
        },
        beliefs: beliefResult.totalBeliefs > 0 ? {
          beliefs: beliefResult.beliefs,
          totalBeliefs: beliefResult.totalBeliefs,
          beliefsByType: beliefResult.beliefsByType,
          summary: beliefSummary,
        } : undefined,
      };

      this.logger.info("[EmotionServiceV2] analyseStatelessEmotionV2 success", {
        tokenUsage: result.usage.analyse_token,
        intensity: emotionItemV2.intensity,
        valence: emotionItemV2.valence,
        complexity: emotionItemV2.complexity,
      });

      // Log usage for billing
      const usageLogs: UsageLogPayloadBody[] = [
        this.buildRequestLogs({
          requestId: requestContext.requestId,
          apiKeyId: requestContext.apiKeyId,
          userId: requestContext.userId,
          projectId: requestContext.projectId,
          apiPath: requestContext.apiPath,
          params: {},
        }),
        this.buildEmotionModelLog({
          requestId: requestContext.requestId,
          apiKeyId: requestContext.apiKeyId,
          userId: requestContext.userId,
          projectId: requestContext.projectId,
          modelName: "emotion-v2",
          tokenUsage: analysed.tokenUsage || 0,
          isContextual: false,
        }),
      ];

      await this.usageQueue?.batchPublish(usageLogs).catch((err) => {
        this.logger.error("[EmotionServiceV2] Error sending usage logs:", err);
      });

      return result;
    } catch (err: unknown) {
      this.logger.error("[EmotionServiceV2] analyseStatelessEmotionV2 failed", {
        error: (err instanceof Error ? err.message : String(err)),
      });
      throw new Error(`Emotion analysis failed (V2): ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  /**
   * Generate human-readable pattern summary (Phase 6.2)
   */
  private generatePatternSummary(patterns: any[]): string {
    if (patterns.length === 0) {
      return "No significant patterns detected yet.";
    }

    const highConfidencePatterns = patterns.filter(p => p.confidence >= 0.7);

    if (highConfidencePatterns.length === 0) {
      return `Detected ${patterns.length} potential emotional patterns with moderate confidence.`;
    }

    const patternTypes = highConfidencePatterns.reduce((acc: Record<string, number>, p) => {
      acc[p.patternType] = (acc[p.patternType] || 0) + 1;
      return acc;
    }, {});

    const typeSummaries = Object.entries(patternTypes)
      .map(([type, count]) => `${count} ${type}`)
      .join(", ");

    return `Detected ${highConfidencePatterns.length} strong emotional patterns: ${typeSummaries}. These patterns reveal recurring emotional dynamics that can inform personalized support.`;
  }
}
