
import { ApiRequestParams } from "@shared/types/request";
import { analyseEmotionValidator } from "./emotion.validator";

// ---------------------------------------------------------------------------
// GoEmotions 27-label taxonomy
// (SamLowe/roberta-base-go_emotions — MIT license)
// These are the ML-predicted labels from the Phase 1 baseline model.
// ---------------------------------------------------------------------------

/**
 * GoEmotions 27-label taxonomy — all ML-predicted via sigmoid multi-label head.
 *
 * Coarse groupings (for backwards-compatibility mapping):
 *   Joy family:     admiration, amusement, approval, caring, excitement,
 *                   gratitude, joy, love, optimism, pride, relief
 *   Sadness family: disappointment, grief, remorse, sadness
 *   Anger family:   anger, annoyance, disapproval, disgust
 *   Fear family:    embarrassment, fear, nervousness
 *   Surprise family:confusion, curiosity, realization, surprise
 *   Neutral:        neutral
 */
export interface GoEmotionScores {
  // Positive high-arousal
  admiration: number;
  amusement: number;
  excitement: number;
  joy: number;
  love: number;
  pride: number;

  // Positive low-to-medium arousal
  approval: number;
  caring: number;
  gratitude: number;
  optimism: number;
  relief: number;

  // Negative high-arousal
  anger: number;
  annoyance: number;
  disapproval: number;
  disgust: number;
  fear: number;
  nervousness: number;

  // Negative low-to-medium arousal
  disappointment: number;
  embarrassment: number;
  grief: number;
  remorse: number;
  sadness: number;

  // Ambiguous / epistemic
  confusion: number;
  curiosity: number;
  desire: number;
  realization: number;
  surprise: number;

  // Neutral
  neutral: number;
}

// ---------------------------------------------------------------------------
// New ML-predicted EQ constructs (Phase 3 multi-task heads)
// ---------------------------------------------------------------------------

/**
 * Empathy scores predicted by the ML empathy/distress head.
 * Trained on Empathic Reactions + WASSA 2022 data.
 */
export interface EmpathyScores {
  /** Empathic concern: other-oriented emotional response to perceived need (0–1) */
  empathicConcern: number;
  /** Personal distress: self-oriented aversive reaction to others' suffering (0–1) */
  personalDistress: number;
}

/**
 * Safety scores predicted by the ML safety/hostility head.
 * Trained on HatEval + custom crisis scenarios.
 */
export interface MLSafetyScores {
  /** ML-predicted hostility/aggression/toxicity composite (0–1) */
  mlSafetyScore: number;
  /** 'none' | 'low' | 'high' predicted by 3-class ML head */
  mlSafetyLevel: "none" | "low" | "high";
}

// ---------------------------------------------------------------------------
// ML-predicted dimensional outputs (DeBERTa multi-task model)
// ---------------------------------------------------------------------------

/**
 * Dimensional outputs predicted directly by the DeBERTa multi-task model.
 *
 * When the multi-task model is deployed, the Python classifier returns these
 * fields alongside the emotion label scores. All fields are optional so that
 * the interface works both before and after the model ships.
 *
 * When present, these values supersede the rule-derived equivalents in the
 * TypeScript EQ analysis service; when absent the service falls back to the
 * current rule-based derivation.
 */
export interface MLDimensionalPredictions {
  /** Valence predicted by the VAD regression head (-1.0 to +1.0) */
  valence?: number;
  /** Arousal predicted by the VAD regression head (0.0 to 1.0) */
  arousal?: number;
  /** Intensity predicted by the intensity regression head (0.0 to 1.0) */
  intensity?: number;
  /** Empathic concern from the empathy head (0.0 to 1.0) */
  empathic_concern?: number;
  /** camelCase alias (populated by snakeToCamelObject) */
  empathicConcern?: number;
  /** Personal distress from the empathy head (0.0 to 1.0) */
  personal_distress?: number;
  /** camelCase alias (populated by snakeToCamelObject) */
  personalDistress?: number;
  /** Safety/hostility composite from the safety head (0.0 to 1.0) */
  safety_score?: number;
  /** camelCase alias */
  safetyScore?: number;
  /** Wonder/curiosity composite from the wonder head (0.0 to 1.0) */
  wonder?: number;
  /** Emotional complexity from the complexity head (0.0 to 1.0) */
  complexity?: number;
}

/**
 * Indicates whether dimensional EQ values were produced by the ML model
 * or derived from rules applied to emotion label scores.
 */
export type DimensionalSource = "ml_predicted" | "rule_derived";

// ---------------------------------------------------------------------------
// Raw Emotion Scores — unified interface
// ---------------------------------------------------------------------------

/**
 * Raw Emotion Scores
 *
 * V1 (6 core): joy, love, sadness, anger, fear, surprise (softmax)
 * Phase 1 (27 GoEmotions): full GoEmotions taxonomy (sigmoid multi-label)
 * Phase 3 (multi-task): empathy/distress and ML safety heads
 *
 * All fields are optional to maintain backwards-compatibility.
 * The active_labels array from the Python API indicates which labels
 * exceeded their per-label calibrated threshold.
 */
export interface RawEmotionScores extends Partial<GoEmotionScores> {
  // ---------------------------------------------------------------------------
  // Legacy V1 core emotions (required for backwards-compatibility)
  // In GoEmotions models these map to the corresponding GoEmotions labels.
  // ---------------------------------------------------------------------------
  love: number;
  joy: number;
  sadness: number;
  anger: number;
  fear: number;
  surprise: number;

  // ---------------------------------------------------------------------------
  // ML-predicted empathy/distress (Phase 3 multi-task head)
  // ---------------------------------------------------------------------------
  empathicConcern?: number;
  personalDistress?: number;

  // ---------------------------------------------------------------------------
  // ML-predicted safety composite (Phase 3 safety head)
  // ---------------------------------------------------------------------------
  mlSafetyScore?: number;

  // ---------------------------------------------------------------------------
  // Legacy Phase 5.1 extended emotions (rule-derived, kept for continuity)
  // In Phase 3 these are replaced by GoEmotions labels above.
  // ---------------------------------------------------------------------------
  wonder?: number;

  // Meta-emotional states (rule-derived from intensity + trajectory)
  breakthrough?: number;
  transcendent?: number;
  discovery?: number;
  insight?: number;
  flow?: number;

  // Pattern emotions (rule-derived from trajectory + growth tracking)
  growth?: number;
  resilience?: number;
  vulnerability?: number;
  connection?: number;
  transformation?: number;

  // Sentiment emotions
  contentment?: number;
  calm?: number;
  fatigue?: number;
  contempt?: number;
  shame?: number;

  // Legacy safety tokens (rule-derived; replaced by mlSafetyScore in Phase 3)
  hostility?: number;
  aggression?: number;
  toxicity?: number;

  // Extensibility
  [key: string]: number | undefined;
}

/** Labels returned by the Python classifier that exceeded per-label thresholds. */
export type ActiveLabels = string[];

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface EmotionApiResponse {
  results: RawEmotionScores;
  activeLabels?: ActiveLabels;
  modelType?: "multilabel" | "single";
  processingTime: number;
  tokenInput: number;
  tokenUsage: number;

  /**
   * ML-predicted dimensional outputs from the DeBERTa multi-task model.
   * Present only when the multi-task model is deployed; absent for the
   * baseline single-head classifier.
   */
  dimensionalPredictions?: MLDimensionalPredictions;

  /** True when this response contains circuit-breaker fallback data, not real ML predictions. */
  isFallback?: boolean;

  /** Reason for fallback (e.g. "ml_classifier_unavailable"). Present only when isFallback is true. */
  fallbackReason?: string;
}

export interface EmotionItem {
  text: string;
  category: string;
  raw: RawEmotionScores;
}

export interface EmotionBatchResult {
  results: RawEmotionScores;
  activeLabels: ActiveLabels;
  processingTime: number;
  tokenInput: number;
  tokenUsage: number;

  /** ML-predicted dimensional outputs (present only with multi-task model). */
  dimensionalPredictions?: MLDimensionalPredictions;

  /** True when this result contains circuit-breaker fallback data. */
  isFallback?: boolean;
}

export interface EmotionBatchResponse {
  batches: EmotionBatchResult[];
  totalProcessingTime: number;
  totalTokenInput: number;
  totalTokenUsage: number;
}

export interface AnalyseEmotionResponse {
  object: "emotions.analyse";
  model: string;
  params: Record<string, any>;
  metadata: Record<string, any>;
  emotions: Record<string, EmotionItem>;
  usage: {};
}

export interface StateEmotionResponse {
  object: "emotions.state";
  params: Record<string, any>;
  metadata: Record<string, any>;
  emotions: Record<string, EmotionItem>;
  usage: {};
}

export interface ContextEmotionResponse {
  object: "emotions.analyse";
  model: string;
  params: Record<string, any>;
  emotions: Record<string, EmotionItem>;
  usage: {
    analyseToken: number;
    analyseTokenDetails: {
      cachedTokens: number;
      audioTokens: number;
    };
  };
}

export interface BatchAnalyseResponse {
  object: "emotions.batch_analyse";
  model: string;
  params: Record<string, any>;
  emotions: EmotionItem[];
  usage: {
    analyseToken: number;
  };
}

export type AnalyseEmotionBody = Awaited<
  ReturnType<typeof analyseEmotionValidator["validate"]>
>;

export interface AnalyseAndStoreParams extends ApiRequestParams {
  externalContextId: string;
  body: AnalyseEmotionBody;
}

export interface AnalyseParams extends ApiRequestParams {
  body: AnalyseEmotionBody;
}

export interface GetContextEmotions extends ApiRequestParams {
  externalContextId: string;
}

export interface GetMessageParams extends ApiRequestParams {
  externalContextId: string;
  externalMessageId: string;
}

// ---------------------------------------------------------------------------
// EQ Thresholds — configurable calibration values
// Loaded from environment / config; these replace hard-coded constants.
// ---------------------------------------------------------------------------

export interface EQThresholds {
  // Complexity: minimum score for an emotion to count as "active"
  complexityActiveMin: number;       // default: 0.25

  // Discovery level breakpoints (intensity thresholds)
  discoveryRoutineMax: number;       // default: 0.35
  discoveryNormalMax: number;        // default: 0.55
  discoverySignificantMax: number;   // default: 0.75
  discoveryBreakthroughMax: number;  // default: 0.90

  // Intensity level breakpoints
  intensityMinimalMax: number;       // default: 0.35
  intensitySubtleMax: number;        // default: 0.55
  intensityModerateMax: number;      // default: 0.75
  intensityHighMax: number;          // default: 0.90

  // Meta-emotional breakthrough threshold
  metaBreakthroughMin: number;       // default: 0.60

  // Safety concern threshold
  safetyFlagMin: number;             // default: 0.40
}

/** Default calibration thresholds — overridden by Phase 4 calibration run. */
export const DEFAULT_EQ_THRESHOLDS: EQThresholds = {
  complexityActiveMin: 0.25,
  discoveryRoutineMax: 0.35,
  discoveryNormalMax: 0.55,
  discoverySignificantMax: 0.75,
  discoveryBreakthroughMax: 0.90,
  intensityMinimalMax: 0.35,
  intensitySubtleMax: 0.55,
  intensityModerateMax: 0.75,
  intensityHighMax: 0.90,
  metaBreakthroughMin: 0.60,
  safetyFlagMin: 0.40,
};
