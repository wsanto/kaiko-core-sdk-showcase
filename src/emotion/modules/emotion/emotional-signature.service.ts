import { injectable, inject } from "tsyringe";
import { Logger } from "winston";
import { EmotionItemV2, RawEmotionScores } from "./types.v2";

/**
 * Emotional Tag System
 * Reference: anima_agentkit/graphrag/emotional_rag.py EmotionalTag
 */
export enum EmotionalTag {
  // Primary emotions
  JOY = "joy",
  SADNESS = "sadness",
  ANGER = "anger",
  FEAR = "fear",
  SURPRISE = "surprise",
  DISGUST = "disgust",

  // Complex emotions
  WONDER = "wonder",
  CURIOSITY = "curiosity",
  ANTICIPATION = "anticipation",
  TRUST = "trust",

  // Meta-emotional states
  BREAKTHROUGH = "breakthrough",
  TRANSCENDENT = "transcendent",
  DISCOVERY = "discovery",
  INSIGHT = "insight",
  FLOW = "flow",

  // Emotional patterns
  GROWTH = "growth",
  RESILIENCE = "resilience",
  VULNERABILITY = "vulnerability",
  CONNECTION = "connection",
  TRANSFORMATION = "transformation",
}

/**
 * Emotional Signature
 * Reference: anima_agentkit/graphrag/emotional_rag.py EmotionalSignature
 */
export interface EmotionalSignature {
  primaryEmotion: string;
  intensity: number;
  complexity: number;
  wonderIndex: number;
  discoveryLevel: string;
  tags: EmotionalTag[];
  valence: number;
  arousal: number;
  timestamp: Date;
  vector: number[]; // 9-dimensional emotional vector
}

/**
 * Emotional Signature Service
 *
 * Creates multi-dimensional emotional signatures and vectors for similarity search.
 * Enables semantic retrieval of emotionally similar moments.
 *
 * Phase 6.1: Emotional Signature & Vector Search
 */
@injectable()
export class EmotionalSignatureService {
  constructor(@inject("LOGGER") private logger: Logger) {}

  /**
   * Create emotional signature from emotion data
   * Reference: emotional_rag.py tag_memory()
   */
  createSignature(
    emotionData: EmotionItemV2,
    content?: string
  ): EmotionalSignature {
    const tags = this.determineEmotionalTags(emotionData, content);
    const vector = this.createEmotionalVector(emotionData, tags);

    const signature: EmotionalSignature = {
      primaryEmotion: emotionData.category,
      intensity: emotionData.intensity,
      complexity: this.complexityToNumber(emotionData.complexity),
      wonderIndex: emotionData.wonderIndex,
      discoveryLevel: emotionData.discoveryLevel,
      tags,
      valence: emotionData.valence,
      arousal: emotionData.arousal,
      timestamp: new Date(),
      vector,
    };

    this.logger.debug("[EmotionalSignatureService] Signature created", {
      primaryEmotion: signature.primaryEmotion,
      tags: signature.tags.length,
      vectorDimensions: signature.vector.length,
    });

    return signature;
  }

  /**
   * Create 9-dimensional emotional vector
   * Reference: emotional_rag.py EmotionalSignature.to_vector()
   *
   * Vector dimensions:
   * [0-1]: Emotion coordinate (valence, arousal)
   * [2]: Intensity (0-1)
   * [3]: Complexity (0-1)
   * [4]: Wonder index (0-1)
   * [5]: Valence (-1 to 1)
   * [6]: Arousal (0-1)
   * [7]: Discovery level (0-1)
   * [8]: Tag richness (0-1)
   */
  private createEmotionalVector(
    emotionData: EmotionItemV2,
    tags: EmotionalTag[]
  ): number[] {
    // Emotion coordinate mapping (valence, arousal)
    const emotionMap: Record<string, [number, number]> = {
      joy: [1.0, 0.8],
      sadness: [-0.8, -0.3],
      anger: [-0.6, 0.7],
      fear: [-0.7, 0.6],
      surprise: [0.3, 0.8],
      curiosity: [0.5, 0.6],
      wonder: [0.8, 0.7],
      love: [0.9, 0.6],
      disgust: [-0.7, 0.4],
      neutral: [0.0, 0.0],
    };

    const baseVector = emotionMap[emotionData.category.toLowerCase()] || [0.0, 0.0];

    const vector = [
      baseVector[0], // Emotional valence component
      baseVector[1], // Emotional arousal component
      emotionData.intensity,
      this.complexityToNumber(emotionData.complexity),
      emotionData.wonderIndex,
      emotionData.valence,
      emotionData.arousal,
      this.discoveryLevelToNumber(emotionData.discoveryLevel),
      tags.length / 10.0, // Tag richness normalized
    ];

    // Normalize vector to unit length
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    const normalizedVector = magnitude > 0 ? vector.map((v) => v / magnitude) : vector;

    this.logger.debug("[EmotionalSignatureService] Vector created", {
      dimensions: normalizedVector.length,
      magnitude: (magnitude ?? 0).toFixed(4),
      normalized: true,
    });

    return normalizedVector;
  }

  /**
   * Determine emotional tags based on signature
   * Reference: emotional_rag.py _determine_emotional_tags()
   */
  private determineEmotionalTags(
    emotionData: EmotionItemV2,
    content?: string
  ): EmotionalTag[] {
    const tags: EmotionalTag[] = [];

    // Primary emotion tag
    const primaryTag = this.emotionToTag(emotionData.category);
    if (primaryTag) {
      tags.push(primaryTag);
    }

    // Wonder and discovery tags
    if (emotionData.wonderIndex >= 0.8) {
      tags.push(EmotionalTag.WONDER);
    }
    if (
      emotionData.wonderIndex >= 0.7 &&
      (emotionData.complexity === "paradoxical" || emotionData.complexity === "transcendent")
    ) {
      tags.push(EmotionalTag.CURIOSITY);
    }

    // Breakthrough tags
    if (emotionData.discoveryLevel === "breakthrough") {
      tags.push(EmotionalTag.BREAKTHROUGH);
    } else if (emotionData.discoveryLevel === "transcendent") {
      tags.push(EmotionalTag.TRANSCENDENT);
      tags.push(EmotionalTag.BREAKTHROUGH);
    }

    // Flow state
    if (emotionData.intensity >= 0.8 && emotionData.valence >= 0.5) {
      tags.push(EmotionalTag.FLOW);
    }

    // Insight
    if (
      emotionData.complexity === "paradoxical" ||
      emotionData.complexity === "transcendent"
    ) {
      tags.push(EmotionalTag.INSIGHT);
    }

    // Content-based tags
    if (content) {
      const lowerContent = content.toLowerCase();

      // Growth
      if (
        (lowerContent.includes("goal") ||
          lowerContent.includes("achieve") ||
          lowerContent.includes("progress")) &&
        emotionData.valence >= 0.3
      ) {
        tags.push(EmotionalTag.GROWTH);
      }

      // Transformation
      if (emotionData.intensity >= 0.7 && Math.abs(emotionData.valence) >= 0.7) {
        tags.push(EmotionalTag.TRANSFORMATION);
      }

      // Vulnerability
      if (
        lowerContent.includes("fear") ||
        lowerContent.includes("worry") ||
        lowerContent.includes("anxious")
      ) {
        tags.push(EmotionalTag.VULNERABILITY);
      }

      // Connection
      if (
        lowerContent.includes("connect") ||
        lowerContent.includes("understand") ||
        lowerContent.includes("empathy")
      ) {
        tags.push(EmotionalTag.CONNECTION);
      }

      // Resilience
      if (
        (lowerContent.includes("overcome") ||
          lowerContent.includes("persist") ||
          lowerContent.includes("recover")) &&
        emotionData.intensity >= 0.5
      ) {
        tags.push(EmotionalTag.RESILIENCE);
      }
    }

    // Remove duplicates
    return Array.from(new Set(tags));
  }

  /**
   * Calculate cosine similarity between two emotional vectors
   * Both vectors should already be normalized
   */
  calculateSimilarity(vector1: number[], vector2: number[]): number {
    if (vector1.length !== vector2.length) {
      this.logger.warn("[EmotionalSignatureService] Vector length mismatch", {
        length1: vector1.length,
        length2: vector2.length,
      });
      return 0;
    }

    // Vectors are already normalized, so dot product = cosine similarity
    const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);

    return Math.max(0, Math.min(1, dotProduct)); // Clamp to [0, 1]
  }

  /**
   * Generate unique signature hash for quick lookups
   */
  generateSignatureHash(signature: EmotionalSignature): string {
    const components = [
      signature.primaryEmotion,
      (signature.intensity ?? 0).toFixed(2),
      (signature.complexity ?? 0).toFixed(2),
      signature.discoveryLevel,
      signature.timestamp.getTime(),
    ];

    // Simple hash using components
    const hashString = components.join("-");
    return Buffer.from(hashString).toString("base64").substring(0, 16);
  }

  /**
   * Map emotion category to EmotionalTag
   */
  private emotionToTag(emotion: string): EmotionalTag | null {
    const map: Record<string, EmotionalTag> = {
      joy: EmotionalTag.JOY,
      sadness: EmotionalTag.SADNESS,
      anger: EmotionalTag.ANGER,
      fear: EmotionalTag.FEAR,
      surprise: EmotionalTag.SURPRISE,
      disgust: EmotionalTag.DISGUST,
    };
    return map[emotion.toLowerCase()] || null;
  }

  /**
   * Convert complexity string to number
   */
  private complexityToNumber(complexity: string): number {
    const map: Record<string, number> = {
      simple: 0.25,
      layered: 0.5,
      paradoxical: 0.75,
      transcendent: 1.0,
    };
    return map[complexity.toLowerCase()] || 0.5;
  }

  /**
   * Convert discovery level to number
   */
  private discoveryLevelToNumber(level: string): number {
    const map: Record<string, number> = {
      routine: 0.2,
      normal: 0.4,
      significant: 0.6,
      breakthrough: 0.8,
      transcendent: 1.0,
    };
    return map[level.toLowerCase()] || 0.4;
  }
}
