import { RawEmotionScores, DimensionalSource } from "./types";

// Re-export RawEmotionScores for use in other modules
export { RawEmotionScores } from "./types";
export { DimensionalSource } from "./types";

/**
 * Enhanced EmotionItem for V2 API
 * Includes multi-dimensional EQ analysis
 *
 * Reference: EQ-AGENT-KIT anima_agentkit/personality.py
 */
export interface EmotionItemV2 {
  // Base fields (same as V1)
  text: string;
  category: string;
  raw: RawEmotionScores;

  // NEW: Multi-dimensional EQ metrics
  /** Overall emotional intensity (0.0-1.0) */
  intensity: number;

  /** Intensity classification */
  intensityLevel: "critical" | "high" | "moderate" | "subtle" | "minimal";

  /** Emotional valence: -1.0 (negative) to +1.0 (positive) */
  valence: number;

  /** Arousal level: 0.0 (calm) to 1.0 (excited) */
  arousal: number;

  /** Emotional complexity based on number of active emotions */
  complexity: "simple" | "layered" | "paradoxical" | "transcendent";

  /** Wonder/curiosity index (0.0-1.0) */
  wonderIndex: number;

  /** Discovery significance level */
  discoveryLevel: "routine" | "normal" | "significant" | "breakthrough" | "transcendent";

  /**
   * Indicates whether dimensional values (valence, arousal, intensity,
   * wonderIndex, empathicConcern, personalDistress, safetyConcernScore)
   * were produced by the DeBERTa multi-task ML model or derived from rules.
   */
  dimensionalSource?: DimensionalSource;

  // Phase 3: ML-predicted empathy dimensions
  /** Empathic concern: other-oriented emotional response (0.0-1.0) */
  empathicConcern?: number;

  /** Personal distress: self-oriented aversive reaction to others' suffering (0.0-1.0) */
  personalDistress?: number;

  /** GoEmotions active labels that exceeded per-label calibrated thresholds */
  activeLabels?: string[];

  // Phase 6.1: Emotional Signature & Vector Search
  /** 9-dimensional emotional vector for similarity search */
  emotionalVector?: number[];

  /** Semantic emotional tags for categorization */
  emotionalTags?: string[];

  /** Unique signature hash for this emotional state */
  emotionalSignature?: string;

  // Phase 6.4: Meta-emotional analysis
  /** Meta-emotional awareness score (0.0-1.0) */
  metaEmotionalScore?: number;

  /** Pattern emotion score (0.0-1.0) */
  patternEmotionScore?: number;

  /** Safety concern score (0.0-1.0) */
  safetyConcernScore?: number;

  /** Whether this is a breakthrough moment */
  isBreakthrough?: boolean;

  /** Hostility state and escalation tracking */
  hostilityState?: HostilityState;

  /** True when this analysis was produced by circuit-breaker fallback, not real ML inference. */
  isFallback?: boolean;
}

/**
 * Trajectory Insights (Phase 2.1)
 * Optional trajectory data included when user has sufficient history
 */
export interface TrajectoryInsights {
  /** Baseline metrics over the specified time window */
  baseline?: {
    window: "week" | "month" | "quarter"; // 7, 30, or 90 days
    dataPointCount: number;
    dominantEmotions: Record<string, number>; // emotion -> frequency (0-1)
    averageIntensity: number; // 0-1
    baselineValence: number; // -1 to 1
    baselineArousal: number; // 0-1
    emotionalVolatility: number; // 0-1 (standard deviation of intensity)
    averageComplexity: string; // most common complexity level
    averageWonderIndex: number; // 0-1
    breakthroughCount: number; // Count of breakthrough/transcendent moments
  };

  /** Trend analysis comparing time periods */
  trend?: {
    direction: "improving" | "stable" | "declining";
    valenceTrend: number; // Change in valence over time
    intensityTrend: number; // Change in intensity over time
    wonderTrend: number; // Change in wonder index over time
    breakthroughRate: number; // Breakthroughs per week
  };

  /** Breakthrough detection for current emotion */
  breakthrough?: {
    detected: boolean;
    type?: "discovery_level" | "intensity_spike" | "wonder_explosion";
    significance?: number;
  };

  /** Phase 6.3: Emotional Momentum */
  momentum?: EmotionalMomentum;

  /** Phase 6.6: Emotional RAG - Similar moments and patterns */
  similarMoments?: {
    moments: SimilarMoment[];
    patterns: EmotionalPattern[];
    insights: string;
  };
}

/**
 * Similar Emotional Moment (Phase 6.6)
 * Past emotional state similar to the current one
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
 * Emotional Momentum (Phase 6.3)
 * Real-time tracking of emotional trajectory changes for crisis prevention
 * Reference: anima_agentkit/graphrag/emotional_rag.py track_emotional_momentum()
 */
export interface EmotionalMomentum {
  currentEmotion: string;
  currentIntensity: number;
  currentWonder: number;
  trajectory: 'escalating' | 'de-escalating' | 'stable';
  momentum: number;              // Change rate per hour
  averageIntensity: number;
  averageWonder: number;
  averageValence: number;
  emotionalVolatility: number;   // Standard deviation of intensity
  discoveryPotential: 'high' | 'medium' | 'low';
  windowHours: number;
  dataPointCount: number;
}

/**
 * Hostility State (Phase 6.4)
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
 * Growth Dimension Types (Phase 3.1)
 * Tracks 5 dimensions of emotional intelligence development
 */
export enum GrowthDimension {
  REGULATION = "regulation",     // Emotional volatility reduction
  AWARENESS = "awareness",       // Complexity increase
  VULNERABILITY = "vulnerability", // Openness frequency
  RESILIENCE = "resilience",     // Recovery time improvement
  COMPLEXITY = "complexity"      // Emotional nuance growth
}

/**
 * Growth Indicator (Phase 3.1)
 * Represents measured growth in a specific dimension
 */
export interface GrowthIndicator {
  dimension: GrowthDimension;
  percentageChange: number;      // -100 to +100
  recentValue: number;           // Recent period measurement
  historicalValue: number;       // Historical period measurement
  threshold: number;             // Minimum % change to consider growth
  isGrowing: boolean;            // True if percentageChange >= threshold
  description: string;           // Human-readable description
}

/**
 * Growth Insights (Phase 3.1)
 * Optional growth tracking data included when user has sufficient history
 */
export interface GrowthInsights {
  /** Time window used for comparison */
  comparisonWindow: {
    recent: { start: Date; end: Date; dataPoints: number };
    historical: { start: Date; end: Date; dataPoints: number };
  };

  /** Growth measurements across all 5 dimensions */
  dimensions: GrowthIndicator[];

  /** Overall growth score (average of all dimensions) */
  overallGrowthScore: number; // -100 to +100

  /** Count of dimensions showing growth */
  dimensionsGrowing: number;

  /** Count of dimensions showing decline */
  dimensionsDecline: number;

  /** Summary description of overall growth */
  summary: string;
}

/**
 * Conversation Mode Types (Phase 4.1)
 * Enables context-aware response shaping based on user needs
 */
export enum ConversationMode {
  CRISIS_INTERVENTION = "crisis_intervention",
  EMOTIONAL_SUPPORT = "emotional_support",
  ANALYTICAL_DEEP_DIVE = "analytical_deep_dive",
  GOAL_STRATEGY = "goal_strategy",
  TASK_EXECUTION = "task_execution",
  INFORMATION_RETRIEVAL = "information_retrieval",
  CONVERSATIONAL = "conversational",
}

/**
 * Response Strategy (Phase 4.1)
 * Guides AI response style based on detected conversation mode
 */
export interface ResponseStrategy {
  tone: string;
  focus: string;
  actionables: string[];
}

/**
 * Conversation Mode Insights (Phase 4.1)
 * Included in all emotion analysis responses for context-aware response shaping
 * Phase 6.5: Enhanced with personality mode detection
 */
export interface ConversationModeInsights {
  /** Detected conversation mode */
  mode: ConversationMode;

  /** Confidence score for the detected mode (0.0-1.0) */
  confidence: number;

  /** Human-readable reasoning for mode selection */
  reasoning: string;

  /** Whether crisis indicators were detected (requires immediate intervention) */
  crisisDetected: boolean;

  /** Recommended response strategy for this mode */
  responseStrategy: ResponseStrategy;

  // Phase 6.5: Personality mode detection
  /** Detected personality mode for response shaping */
  personalityMode?: PersonalityMode;

  /** Confidence score for personality mode (0.0-1.0) */
  personalityConfidence?: number;

  /** Detailed response guidance for AI */
  responseGuidance?: ResponseGuidance;
}

/**
 * Personality Mode Types (Phase 6.5)
 * Intelligent mode detection for AI response shaping
 * Reference: anima_agentkit/personality.py PromptType
 */
export enum PersonalityMode {
  CORE = 'core',
  THERAPEUTIC = 'therapeutic',
  CRISIS = 'crisis',
  COACHING = 'coaching',
  CONVERSATIONAL = 'conversational',
  MINIMAL = 'minimal',
  ANALYTICAL = 'analytical',
}

/**
 * Response Guidance (Phase 6.5)
 * Guides AI tone, focus, and communication style
 */
export interface ResponseGuidance {
  tone: string;                    // "empathetic", "analytical", etc.
  focus: string;                   // What to emphasize
  speechPatterns: string[];        // Natural fillers/reactions
  prohibitions: string[];          // What to avoid
  exampleResponses: string[];
}

/**
 * Belief Types (Phase 5.2)
 * Categories of beliefs that can be detected in user messages
 */
export enum BeliefType {
  EXPLICIT = "explicit",       // "I believe that..."
  IDENTITY = "identity",        // "I am someone who..."
  VALUE = "value",             // "X is important to me..."
  PURPOSE = "purpose",         // "My purpose is..."
}

/**
 * Detected Belief (Phase 5.2)
 * A single belief extracted from user message
 */
export interface DetectedBelief {
  type: BeliefType;
  content: string;
  confidence: number;
  rawMatch: string;
}

/**
 * Belief Insights (Phase 5.2)
 * Summary of all beliefs detected in a message
 */
export interface BeliefInsights {
  beliefs: DetectedBelief[];
  totalBeliefs: number;
  beliefsByType: Record<BeliefType, number>;
  summary: string;
}

/**
 * Pattern Types (Phase 6.2)
 * Categories of emotional patterns that can be detected
 */
export enum PatternTypeEnum {
  TEMPORAL = "temporal",             // Time-based patterns
  TRIGGER_BASED = "trigger_based",   // Event-triggered reactions
  CYCLICAL = "cyclical",             // Repeating emotional cycles
  SEQUENTIAL = "sequential",         // One emotion leads to another
  RECOVERY = "recovery"              // Bounce-back patterns (resilience)
}

/**
 * Detected Pattern (Phase 6.2)
 * A single detected emotional pattern
 */
export interface DetectedPattern {
  patternId: string;
  patternType: PatternTypeEnum;
  name: string;
  description: string;
  trigger?: string;
  emotionalSequence: string[];
  frequency: number;
  confidence: number;
  lastOccurrence: Date;
  firstDetected: Date;
  typicalDuration?: number;      // Minutes
  typicalIntensity?: number;     // 0-1
}

/**
 * Pattern Insights (Phase 6.2)
 * Summary of detected emotional patterns
 */
export interface PatternInsights {
  detected: DetectedPattern[];
  activePatterns: string[];      // Pattern IDs currently active
  patternSummary: string;        // Human-readable summary
}

/**
 * V2 Analysis Response
 * Renamed from "analyse" to "analysis" for better convention
 * Phase 2.1: Includes optional trajectory insights
 * Phase 3.1: Includes optional growth insights
 * Phase 4.1: Includes conversation mode detection
 * Phase 5.2: Includes belief detection
 * Phase 6.2: Includes pattern detection
 */
export interface AnalysisEmotionResponseV2 {
  object: "emotions.analysis";
  model: string;
  /** Always "per_message" — clarifies that scores are for the submitted text, not an aggregate. */
  response_type?: "per_message";
  /** True when ML classifier was unavailable and scores are synthetic fallback data. */
  isFallback?: boolean;
  /** "ml_predicted" | "rule_derived" | "fallback" — indicates the quality/source of the scores. */
  dataQuality?: string;
  /** Number of messages stored in this context (context-based endpoint only). */
  context_message_count?: number;
  emotions: {
    [role: string]: EmotionItemV2;
  };
  metadata: Record<string, any>;
  usage: {
    total_tokens?: number;
    analyse_token?: number;
    analyse_token_details?: {
      cached_tokens: number;
      audio_tokens: number;
    };
  };
  params?: Record<string, any>;
  trajectory?: TrajectoryInsights;
  growth?: GrowthInsights;
  conversationMode?: ConversationModeInsights;
  beliefs?: BeliefInsights;
  patterns?: PatternInsights;
}

/**
 * V2 State Response
 * Used for GET endpoints that return emotion state
 * Phase 2.1: Includes optional trajectory insights
 * Phase 3.1: Includes optional growth insights
 * Phase 4.1: Includes conversation mode detection
 * Phase 5.2: Includes belief detection
 * Phase 6.2: Includes pattern detection
 */
export interface StateEmotionResponseV2 {
  object: "emotions.state";
  model: string;
  response_type?: "per_message";
  isFallback?: boolean;
  dataQuality?: string;
  context_message_count?: number;
  emotions: {
    [role: string]: EmotionItemV2;
  };
  metadata: Record<string, any>;
  usage: {};
  params?: Record<string, any>;
  trajectory?: TrajectoryInsights;
  growth?: GrowthInsights;
  conversationMode?: ConversationModeInsights;
  beliefs?: BeliefInsights;
  patterns?: PatternInsights;
}

/**
 * V2 Batch Analysis Response
 */
export interface BatchAnalysisResponseV2 {
  object: "emotions.batch_analysis";
  model: string;
  emotions: EmotionItemV2[];
  metadata: Record<string, any>;
  usage: {
    total_tokens?: number;
  };
  params?: Record<string, any>;
}

/**
 * V2 Chat Completion Response
 * Enhanced with V2 emotion fields
 */
export interface ChatCompletionResponseV2 {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  emotions?: {
    [role: string]: EmotionItemV2;
  };
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
