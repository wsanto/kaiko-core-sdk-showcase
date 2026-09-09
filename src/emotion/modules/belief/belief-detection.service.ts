import { injectable, inject } from "tsyringe";
import { Logger } from "winston";

/**
 * Belief Detection Service
 * Phase 5.2: Belief System Detection
 *
 * Detects and extracts beliefs, values, identity statements, and purpose
 * from user messages using regex pattern matching.
 */

export enum BeliefType {
  EXPLICIT = "explicit",       // "I believe that..."
  IDENTITY = "identity",        // "I am someone who..."
  VALUE = "value",             // "X is important to me..."
  PURPOSE = "purpose",         // "My purpose is..."
}

export interface DetectedBelief {
  type: BeliefType;
  content: string;
  confidence: number;
  rawMatch: string;
}

export interface BeliefDetectionResult {
  beliefs: DetectedBelief[];
  totalBeliefs: number;
  beliefsByType: Record<BeliefType, number>;
}

@injectable()
export class BeliefDetectionService {
  // Explicit belief patterns
  private readonly EXPLICIT_BELIEF_PATTERNS = [
    /I believe\s+(?:that\s+)?(.+)/i,
    /I think\s+(?:that\s+)?(.+)/i,
    /(?:In my opinion|I feel that)\s+(.+)/i,
    /I'm convinced\s+(?:that\s+)?(.+)/i,
  ];

  // Identity patterns
  private readonly IDENTITY_PATTERNS = [
    /I am\s+(?:someone who|the kind of person who|a person who)\s+(.+)/i,
    /I am\s+(?:a|an)\s+(.+?)\s+(?:person|individual)/i,
    /I consider myself\s+(?:to be\s+)?(.+)/i,
    /I identify as\s+(.+)/i,
  ];

  // Value patterns
  private readonly VALUE_PATTERNS = [
    /(.+?)\s+is\s+(?:very\s+)?important\s+to\s+me/i,
    /I value\s+(.+)/i,
    /(.+?)\s+matters\s+(?:a lot\s+)?to\s+me/i,
    /I care\s+(?:deeply\s+)?about\s+(.+)/i,
  ];

  // Purpose patterns
  private readonly PURPOSE_PATTERNS = [
    /(?:My|Our)\s+purpose\s+is\s+(?:to\s+)?(.+)/i,
    /I exist\s+(?:to|for)\s+(.+)/i,
    /(?:My|Our)\s+mission\s+is\s+(?:to\s+)?(.+)/i,
    /I'm here\s+to\s+(.+)/i,
  ];

  constructor(@inject("LOGGER") private logger: Logger) {}

  /**
   * Detect beliefs in a text message
   *
   * @param text - The message text to analyze
   * @returns BeliefDetectionResult with all detected beliefs
   */
  detectBeliefs(text: string): BeliefDetectionResult {
    this.logger.debug("[BeliefDetectionService] Detecting beliefs", {
      textLength: text.length,
    });

    const beliefs: DetectedBelief[] = [];

    // Detect explicit beliefs
    const explicitBeliefs = this.detectPattern(
      text,
      this.EXPLICIT_BELIEF_PATTERNS,
      BeliefType.EXPLICIT
    );
    beliefs.push(...explicitBeliefs);

    // Detect identity statements
    const identityBeliefs = this.detectPattern(
      text,
      this.IDENTITY_PATTERNS,
      BeliefType.IDENTITY
    );
    beliefs.push(...identityBeliefs);

    // Detect values
    const valueBeliefs = this.detectPattern(
      text,
      this.VALUE_PATTERNS,
      BeliefType.VALUE
    );
    beliefs.push(...valueBeliefs);

    // Detect purpose
    const purposeBeliefs = this.detectPattern(
      text,
      this.PURPOSE_PATTERNS,
      BeliefType.PURPOSE
    );
    beliefs.push(...purposeBeliefs);

    // Count beliefs by type
    const beliefsByType: Record<BeliefType, number> = {
      [BeliefType.EXPLICIT]: explicitBeliefs.length,
      [BeliefType.IDENTITY]: identityBeliefs.length,
      [BeliefType.VALUE]: valueBeliefs.length,
      [BeliefType.PURPOSE]: purposeBeliefs.length,
    };

    this.logger.debug("[BeliefDetectionService] Beliefs detected", {
      totalBeliefs: beliefs.length,
      beliefsByType,
    });

    return {
      beliefs,
      totalBeliefs: beliefs.length,
      beliefsByType,
    };
  }

  /**
   * Detect patterns in text and create belief objects
   *
   * @param text - The text to analyze
   * @param patterns - Array of regex patterns to match
   * @param type - The type of belief being detected
   * @returns Array of detected beliefs
   */
  private detectPattern(
    text: string,
    patterns: RegExp[],
    type: BeliefType
  ): DetectedBelief[] {
    const beliefs: DetectedBelief[] = [];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const content = match[1].trim();

        // Clean up the content (remove trailing punctuation)
        const cleanContent = content.replace(/[.,;!?]+$/, '').trim();

        // Skip if content is too short or empty
        if (cleanContent.length < 3) continue;

        // Calculate confidence based on pattern specificity
        const confidence = this.calculateConfidence(pattern, cleanContent);

        beliefs.push({
          type,
          content: cleanContent,
          confidence,
          rawMatch: match[0],
        });
      }
    }

    return beliefs;
  }

  /**
   * Calculate confidence score for a detected belief
   *
   * @param pattern - The regex pattern that matched
   * @param content - The extracted belief content
   * @returns Confidence score (0.0 to 1.0)
   */
  private calculateConfidence(pattern: RegExp, content: string): number {
    let confidence = 0.7; // Base confidence

    // Increase confidence for longer, more complete statements
    if (content.length > 20) confidence += 0.1;
    if (content.length > 50) confidence += 0.1;

    // Decrease confidence for very short statements
    if (content.length < 10) confidence -= 0.2;

    // Ensure confidence is within bounds
    return Math.max(0.3, Math.min(1.0, confidence));
  }

  /**
   * Check if a message contains any beliefs
   *
   * @param text - The message text to analyze
   * @returns True if beliefs are detected
   */
  hasBeliefs(text: string): boolean {
    const result = this.detectBeliefs(text);
    return result.totalBeliefs > 0;
  }

  /**
   * Get beliefs of a specific type
   *
   * @param text - The message text to analyze
   * @param type - The type of belief to filter
   * @returns Array of detected beliefs of the specified type
   */
  getBeliefsOfType(text: string, type: BeliefType): DetectedBelief[] {
    const result = this.detectBeliefs(text);
    return result.beliefs.filter(belief => belief.type === type);
  }

  /**
   * Get the most confident belief from detected beliefs
   *
   * @param text - The message text to analyze
   * @returns The belief with highest confidence, or null if none found
   */
  getMostConfidentBelief(text: string): DetectedBelief | null {
    const result = this.detectBeliefs(text);

    if (result.beliefs.length === 0) return null;

    return result.beliefs.reduce((max, belief) =>
      belief.confidence > max.confidence ? belief : max
    );
  }

  /**
   * Generate a summary of detected beliefs
   *
   * @param text - The message text to analyze
   * @returns Human-readable summary
   */
  generateBeliefSummary(text: string): string {
    const result = this.detectBeliefs(text);

    if (result.totalBeliefs === 0) {
      return "No beliefs detected";
    }

    const summaryParts: string[] = [];

    if (result.beliefsByType[BeliefType.EXPLICIT] > 0) {
      summaryParts.push(`${result.beliefsByType[BeliefType.EXPLICIT]} explicit belief(s)`);
    }
    if (result.beliefsByType[BeliefType.IDENTITY] > 0) {
      summaryParts.push(`${result.beliefsByType[BeliefType.IDENTITY]} identity statement(s)`);
    }
    if (result.beliefsByType[BeliefType.VALUE] > 0) {
      summaryParts.push(`${result.beliefsByType[BeliefType.VALUE]} value(s)`);
    }
    if (result.beliefsByType[BeliefType.PURPOSE] > 0) {
      summaryParts.push(`${result.beliefsByType[BeliefType.PURPOSE]} purpose statement(s)`);
    }

    return `Detected ${result.totalBeliefs} belief(s): ${summaryParts.join(", ")}`;
  }
}
