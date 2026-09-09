import { injectable } from "tsyringe";
import {
  RawEmotionScores,
  EQThresholds,
  DEFAULT_EQ_THRESHOLDS,
  MLDimensionalPredictions,
  DimensionalSource,
} from "./types";
import { EmotionItemV2 } from "./types.v2";

/**
 * EQ Analysis Service — V2
 *
 * Multi-dimensional emotional intelligence analysis updated for the
 * GoEmotions 27-label taxonomy (Phase 1+) and configurable calibrated
 * thresholds (Phase 4).
 *
 * Changes from V1:
 *  - Valence/arousal emotion lists expanded to cover all 27 GoEmotions labels
 *  - All threshold constants moved to EQThresholds (injectable / hot-updatable)
 *  - Wonder index updated to use GoEmotions curiosity + surprise + admiration + realization
 *  - Complexity updated to use configurable complexityActiveMin
 *  - Empathy/distress signals forwarded from ML head when present
 *
 * Ported from: EQ-AGENT-KIT anima_agentkit/personality.py
 */
@injectable()
export class EQAnalysisService {

  private thresholds: EQThresholds;

  constructor() {
    this.thresholds = { ...DEFAULT_EQ_THRESHOLDS };
  }

  /**
   * Hot-update calibration thresholds (Phase 4).
   * Call this after running the calibration pipeline to replace defaults.
   */
  updateThresholds(thresholds: Partial<EQThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  // ------------------------------------------------------------------
  // Valence
  // ------------------------------------------------------------------

  /**
   * Calculate valence (positive vs negative emotional tone).
   *
   * When ML-predicted valence is provided via `mlPredictions`, it is returned
   * directly (more accurate than rule derivation). Otherwise falls back to
   * the rule-based calculation over GoEmotions labels.
   *
   * Reference: anima_agentkit/graphrag/emotional_rag.py:152-163
   *
   * @param emotions Raw emotion scores
   * @param mlPredictions Optional ML dimensional predictions
   * @returns Valence score (-1.0 to +1.0)
   */
  calculateValence(emotions: RawEmotionScores, mlPredictions?: MLDimensionalPredictions): number {
    if (mlPredictions?.valence != null) {
      return mlPredictions.valence;
    }

    // NRC-VAD Lexicon valence coefficients per GoEmotions label
    // Scale: -1.0 (most negative) to +1.0 (most positive)
    // Source: NRC Valence-Arousal-Dominance Lexicon (Mohammad, 2018)
    const valenceCoefficients: Record<string, number> = {
      admiration:     0.82,
      amusement:      0.85,
      anger:         -0.80,
      annoyance:     -0.53,
      approval:       0.62,
      caring:         0.75,
      confusion:     -0.20,
      curiosity:      0.55,
      desire:         0.60,
      disappointment:-0.65,
      disapproval:   -0.55,
      disgust:       -0.78,
      embarrassment: -0.55,
      excitement:     0.85,
      fear:          -0.73,
      gratitude:      0.88,
      grief:         -0.88,
      joy:            0.95,
      love:           0.92,
      nervousness:   -0.45,
      neutral:        0.00,
      optimism:       0.78,
      pride:          0.77,
      realization:    0.30,
      relief:         0.65,
      remorse:       -0.60,
      sadness:       -0.82,
      surprise:       0.20,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [emotion, score] of Object.entries(emotions)) {
      if (score === undefined || score === 0) continue;
      const coeff = valenceCoefficients[emotion];
      if (coeff !== undefined) {
        weightedSum += coeff * score;
        totalWeight += score;
      }
    }

    if (totalWeight === 0) return 0;
    return Math.max(-1, Math.min(1, weightedSum / totalWeight));
  }

  // ------------------------------------------------------------------
  // Arousal
  // ------------------------------------------------------------------

  /**
   * Calculate arousal (energy level: calm vs excited).
   *
   * When ML-predicted arousal is provided via `mlPredictions`, it is returned
   * directly. Otherwise falls back to rule-based derivation.
   *
   * Reference: anima_agentkit/graphrag/emotional_rag.py:165-176
   *
   * @param emotions Raw emotion scores
   * @param mlPredictions Optional ML dimensional predictions
   * @returns Arousal score (0.0 to 1.0)
   */
  calculateArousal(emotions: RawEmotionScores, mlPredictions?: MLDimensionalPredictions): number {
    if (mlPredictions?.arousal != null) {
      return mlPredictions.arousal;
    }

    // NRC-VAD Lexicon arousal coefficients per GoEmotions label
    // Scale: 0.0 (calm/deactivated) to 1.0 (excited/activated)
    // Source: NRC Valence-Arousal-Dominance Lexicon (Mohammad, 2018)
    const arousalCoefficients: Record<string, number> = {
      admiration:     0.54,
      amusement:      0.72,
      anger:          0.87,
      annoyance:      0.62,
      approval:       0.35,
      caring:         0.42,
      confusion:      0.50,
      curiosity:      0.60,
      desire:         0.68,
      disappointment: 0.35,
      disapproval:    0.45,
      disgust:        0.62,
      embarrassment:  0.55,
      excitement:     0.90,
      fear:           0.85,
      gratitude:      0.45,
      grief:          0.40,
      joy:            0.80,
      love:           0.65,
      nervousness:    0.75,
      neutral:        0.30,
      optimism:       0.55,
      pride:          0.60,
      realization:    0.45,
      relief:         0.30,
      remorse:        0.40,
      sadness:        0.27,
      surprise:       0.82,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [emotion, score] of Object.entries(emotions)) {
      if (score === undefined || score === 0) continue;
      const coeff = arousalCoefficients[emotion];
      if (coeff !== undefined) {
        weightedSum += coeff * score;
        totalWeight += score;
      }
    }

    if (totalWeight === 0) return 0.5;
    return Math.max(0, Math.min(1, weightedSum / totalWeight));
  }

  // ------------------------------------------------------------------
  // Complexity
  // ------------------------------------------------------------------

  /**
   * Compute emotional complexity based on number of active emotions.
   *
   * When the ML complexity head provides a score (0–1), map it to the
   * categorical label directly. Otherwise count active emotions as before.
   *
   * Reference: anima_agentkit/personality.py:858-866
   */
  computeComplexity(
    emotions: RawEmotionScores,
    mlPredictions?: MLDimensionalPredictions,
  ): "simple" | "layered" | "paradoxical" | "transcendent" {
    // ML-predicted complexity: continuous 0–1 mapped to categorical
    if (mlPredictions?.complexity !== undefined) {
      const c = mlPredictions.complexity;
      if (c >= 0.75) return "transcendent";
      if (c >= 0.50) return "paradoxical";
      if (c >= 0.25) return "layered";
      return "simple";
    }

    // Rule-based fallback
    const minScore = this.thresholds.complexityActiveMin;
    const activeCount = Object.values(emotions)
      .filter((score): score is number => score !== undefined && score > minScore)
      .length;

    if (activeCount >= 4) return "transcendent";
    if (activeCount === 3) return "paradoxical";
    if (activeCount === 2) return "layered";
    return "simple";
  }

  // ------------------------------------------------------------------
  // Wonder Index
  // ------------------------------------------------------------------

  /**
   * Calculate wonder index (curiosity/openness to discovery).
   *
   * When the ML wonder head provides a score, use it directly.
   * Otherwise derive from GoEmotions curiosity + surprise + admiration + realization.
   *
   * Reference: anima_agentkit/nexus_enhanced.py:779-788
   */
  calculateWonderIndex(emotions: RawEmotionScores, mlPredictions?: MLDimensionalPredictions): number {
    if (mlPredictions?.wonder !== undefined) {
      return mlPredictions.wonder;
    }

    const wonderEmotions = [
      // GoEmotions epistemic/wonder labels
      "curiosity", "surprise", "admiration", "realization",
      // Legacy
      "wonder", "anticipation",
    ];

    let total = 0;
    let count = 0;

    for (const emotion of wonderEmotions) {
      const score = emotions[emotion as keyof RawEmotionScores] as number | undefined;
      if (score !== undefined && score > 0) {
        total += score;
        count++;
      }
    }

    return count > 0 ? total / count : 0;
  }

  // ------------------------------------------------------------------
  // Discovery Level & Intensity (calibrated thresholds)
  // ------------------------------------------------------------------

  /**
   * Determine discovery level based on intensity.
   * Thresholds sourced from this.thresholds (Phase 4 calibration).
   *
   * Reference: anima_agentkit/personality.py:869-878
   */
  computeDiscoveryLevel(
    intensity: number
  ): "routine" | "normal" | "significant" | "breakthrough" | "transcendent" {
    const t = this.thresholds;
    if (intensity >= t.discoveryBreakthroughMax) return "transcendent";
    if (intensity >= t.discoverySignificantMax)  return "breakthrough";
    if (intensity >= t.discoveryNormalMax)       return "significant";
    if (intensity >= t.discoveryRoutineMax)      return "normal";
    return "routine";
  }

  /**
   * Classify intensity level.
   * Thresholds sourced from this.thresholds (Phase 4 calibration).
   *
   * Reference: anima_agentkit/cognition.py intensity thresholds
   */
  classifyIntensityLevel(
    intensity: number
  ): "critical" | "high" | "moderate" | "subtle" | "minimal" {
    const t = this.thresholds;
    if (intensity >= t.intensityHighMax)     return "critical";
    if (intensity >= t.intensityModerateMax) return "high";
    if (intensity >= t.intensitySubtleMax)   return "moderate";
    if (intensity >= t.intensityMinimalMax)  return "subtle";
    return "minimal";
  }

  // ------------------------------------------------------------------
  // Enriched text
  // ------------------------------------------------------------------

  /**
   * Enhanced emotion text descriptor.
   * Reference: anima_agentkit/personality.py:230-242
   */
  enrichEmotionText(category: string, intensity: number): string {
    const t = this.thresholds;
    if (intensity >= t.intensityHighMax)     return `really ${category.toUpperCase()}`;
    if (intensity >= t.intensityModerateMax) return `pretty ${category.toUpperCase()}`;
    if (intensity >= t.intensitySubtleMax)   return category.toUpperCase();
    if (intensity >= t.intensityMinimalMax)  return `somewhat ${category.toLowerCase()}`;
    return `slightly ${category.toLowerCase()}`;
  }

  // ------------------------------------------------------------------
  // Meta-emotional & pattern scores (Phase 5.1)
  // ------------------------------------------------------------------

  /**
   * Calculate meta-emotional state score.
   * Measures breakthrough moments and transcendent experiences.
   */
  calculateMetaEmotionalScore(emotions: RawEmotionScores): number {
    const metaEmotions = ["breakthrough", "transcendent", "discovery", "insight", "flow"];
    return this._averageActiveScores(emotions, metaEmotions);
  }

  /**
   * Calculate pattern emotion score.
   * Measures growth, resilience, and transformation patterns.
   */
  calculatePatternEmotionScore(emotions: RawEmotionScores): number {
    const patternEmotions = ["growth", "resilience", "vulnerability", "connection", "transformation"];
    return this._averageActiveScores(emotions, patternEmotions);
  }

  /**
   * Calculate safety concern score.
   *
   * Priority order:
   *   1. ML dimensional safety_score from DeBERTa multi-task model
   *   2. mlSafetyScore embedded in RawEmotionScores (Phase 3 safety head)
   *   3. Rule-derived from legacy safety labels (hostility/aggression/toxicity)
   */
  calculateSafetyConcernScore(
    emotions: RawEmotionScores,
    mlPredictions?: MLDimensionalPredictions,
  ): number {
    // DeBERTa multi-task dimensional safety score (highest priority)
    if ((mlPredictions?.safety_score ?? mlPredictions?.safetyScore) != null) {
      return (mlPredictions!.safety_score ?? mlPredictions!.safetyScore) as number;
    }
    // Phase 3: Prefer ML-predicted safety score on raw emotions
    if (emotions.mlSafetyScore !== undefined) {
      return emotions.mlSafetyScore;
    }
    // Fallback: rule-derived from legacy safety labels
    const safetyEmotions = ["hostility", "aggression", "toxicity"];
    return this._averageActiveScores(emotions, safetyEmotions);
  }

  isBreakthroughMoment(emotions: RawEmotionScores): boolean {
    return this.calculateMetaEmotionalScore(emotions) >= this.thresholds.metaBreakthroughMin;
  }

  hasSafetyConcerns(emotions: RawEmotionScores): boolean {
    return this.calculateSafetyConcernScore(emotions) >= this.thresholds.safetyFlagMin;
  }

  // ------------------------------------------------------------------
  // Empathy helpers (Phase 3 ML heads)
  // ------------------------------------------------------------------

  /**
   * Extract empathy signals.
   *
   * Priority order:
   *   1. DeBERTa dimensional predictions (empathic_concern / personal_distress)
   *   2. Phase 3 ML fields on RawEmotionScores (empathicConcern / personalDistress)
   *   3. Rule-derived proxy from GoEmotions caring/fear labels
   */
  getEmpathySignals(
    emotions: RawEmotionScores,
    mlPredictions?: MLDimensionalPredictions,
  ): { empathicConcern: number; personalDistress: number } {
    // DeBERTa multi-task empathy head (highest priority)
    if (mlPredictions) {
      const ec = mlPredictions.empathic_concern ?? mlPredictions.empathicConcern;
      const pd = mlPredictions.personal_distress ?? mlPredictions.personalDistress;
      if (ec != null && pd != null) {
        return { empathicConcern: ec, personalDistress: pd };
      }
    }

    // Phase 3: use ML-predicted empathy/distress head output on raw scores
    if (emotions.empathicConcern !== undefined && emotions.personalDistress !== undefined) {
      return {
        empathicConcern: emotions.empathicConcern,
        personalDistress: emotions.personalDistress,
      };
    }

    // Phase 1/2 proxy: derive from caring + sympathy-adjacent GoEmotions labels
    const concernProxy = this._averageActiveScores(emotions, ["caring", "grief", "remorse", "love"]);
    const distressProxy = this._averageActiveScores(emotions, ["fear", "nervousness", "embarrassment"]);

    return {
      empathicConcern: concernProxy,
      personalDistress: distressProxy,
    };
  }

  // ------------------------------------------------------------------
  // Dimensional source detection
  // ------------------------------------------------------------------

  /**
   * Determine whether ML dimensional predictions are available.
   *
   * Returns `"ml_predicted"` when the DeBERTa multi-task model has provided
   * at least the core VAD values (valence + arousal). Otherwise returns
   * `"rule_derived"`.
   */
  detectDimensionalSource(mlPredictions?: MLDimensionalPredictions): DimensionalSource {
    if (
      mlPredictions &&
      mlPredictions.valence !== undefined &&
      mlPredictions.arousal !== undefined
    ) {
      return "ml_predicted";
    }
    return "rule_derived";
  }

  // ------------------------------------------------------------------
  // Main analysis entry point
  // ------------------------------------------------------------------

  /**
   * Perform full multi-dimensional EQ analysis.
   *
   * When `mlPredictions` is provided (from the DeBERTa multi-task classifier
   * response), the service uses ML-predicted dimensional values directly for
   * valence, arousal, intensity, complexity, wonder, empathy, and safety.
   * When absent, it falls back to the current rule-based derivation.
   *
   * @param raw             Raw emotion scores (GoEmotions 27-label or legacy 6-label)
   * @param mlPredictions   Optional ML-predicted dimensional outputs
   * @returns Complete EmotionItemV2 with all EQ dimensions
   */
  analyzeEmotions(raw: RawEmotionScores, mlPredictions?: MLDimensionalPredictions): EmotionItemV2 {
    const entries = Object.entries(raw).filter(
      ([_, score]) => score !== undefined
    ) as [string, number][];

    const [category, rawIntensity] = entries.reduce(
      (max, curr) => curr[1] > max[1] ? curr : max,
      ["neutral", 0] as [string, number]
    );

    // Use ML-predicted intensity when available; otherwise use max raw score
    const intensity = mlPredictions?.intensity != null
      ? mlPredictions.intensity
      : rawIntensity;

    const valence = this.calculateValence(raw, mlPredictions);
    const arousal = this.calculateArousal(raw, mlPredictions);
    const complexity = this.computeComplexity(raw, mlPredictions);
    const wonderIndex = this.calculateWonderIndex(raw, mlPredictions);
    const discoveryLevel = this.computeDiscoveryLevel(intensity);
    const intensityLevel = this.classifyIntensityLevel(intensity);
    const text = this.enrichEmotionText(category, intensity);
    const dimensionalSource = this.detectDimensionalSource(mlPredictions);

    const result: EmotionItemV2 = {
      text,
      category,
      intensity,
      intensityLevel,
      valence,
      arousal,
      complexity,
      wonderIndex,
      discoveryLevel,
      dimensionalSource,
      raw,
    };

    // Add empathy predictions if available from dimensional sidecar
    if (mlPredictions) {
      const ec = mlPredictions.empathic_concern ?? mlPredictions.empathicConcern;
      const pd = mlPredictions.personal_distress ?? mlPredictions.personalDistress;
      if (ec != null) result.empathicConcern = ec;
      if (pd != null) result.personalDistress = pd;
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private _averageActiveScores(emotions: RawEmotionScores, keys: string[]): number {
    let total = 0;
    let count = 0;
    for (const key of keys) {
      const score = emotions[key as keyof RawEmotionScores] as number | undefined;
      if (score !== undefined && score > 0) {
        total += score;
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }
}
