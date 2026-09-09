import { injectable, inject } from "tsyringe";
import { Logger } from "winston";

/**
 * Conversation Mode Detection Service
 * Phase 4.1: Context-Aware Response Shaping
 *
 * Detects the type of conversation mode based on emotional state and message content.
 * Enables adaptive response strategies based on user needs.
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

export interface ModeDetectionResult {
  mode: ConversationMode;
  confidence: number;
  reasoning: string;
  crisisDetected: boolean;
}

@injectable()
export class ConversationModeService {
  // Crisis detection patterns
  private readonly CRISIS_PATTERNS = [
    /\b(suicide|suicidal|kill myself|end it all|not worth living)\b/i,
    /\b(self[- ]?harm|hurt myself|cutting|self[- ]?injury)\b/i,
    /\b(hopeless|no way out|can't go on|give up)\b/i,
    /\b(emergency|crisis|desperate|help me)\b/i,
  ];

  // Analytical patterns
  private readonly ANALYTICAL_PATTERNS = [
    /\b(analyze|pattern|trend|insight|why|understand|explain)\b/i,
    /\b(cause|reason|factor|relationship|correlation)\b/i,
    /\b(deep dive|explore|investigate|examine)\b/i,
  ];

  // Goal/Strategy patterns
  private readonly GOAL_STRATEGY_PATTERNS = [
    /\b(goal|plan|strategy|achieve|accomplish|succeed)\b/i,
    /\b(future|vision|direction|path|roadmap)\b/i,
    /\b(improve|optimize|enhance|develop)\b/i,
  ];

  // Task execution patterns
  private readonly TASK_PATTERNS = [
    /\b(do|make|create|build|implement|execute)\b/i,
    /\b(action|task|todo|complete|finish)\b/i,
    /\b(now|today|immediately|urgent)\b/i,
  ];

  // Information retrieval patterns
  private readonly INFO_PATTERNS = [
    /\b(what|when|where|who|which|how many)\b/i,
    /\b(find|search|look up|tell me|show me)\b/i,
    /\b(information|data|fact|detail)\b/i,
  ];

  constructor(@inject("LOGGER") private logger: Logger) {}

  /**
   * Detects the conversation mode based on emotional state and message content
   *
   * @param intensity - Emotional intensity (0.0 to 1.0)
   * @param valence - Emotional valence (-1.0 to 1.0)
   * @param messageContent - The message text to analyze
   * @returns ModeDetectionResult with mode, confidence, and reasoning
   */
  detectMode(
    intensity: number,
    valence: number,
    messageContent: string
  ): ModeDetectionResult {
    this.logger.debug("[ConversationModeService] Detecting conversation mode", {
      intensity,
      valence,
      messageLength: messageContent.length,
    });

    // Step 1: Crisis detection (highest priority)
    const crisisDetected = this.detectCrisis(messageContent, intensity);
    if (crisisDetected) {
      return {
        mode: ConversationMode.CRISIS_INTERVENTION,
        confidence: 1.0,
        reasoning: "Crisis indicators detected with high emotional intensity",
        crisisDetected: true,
      };
    }

    // Step 2: Emotional support (high intensity, negative valence)
    if (intensity >= 0.65 && valence < -0.3) {
      return {
        mode: ConversationMode.EMOTIONAL_SUPPORT,
        confidence: this.calculateConfidence(intensity, 0.65, 0.85),
        reasoning: "High emotional intensity with negative valence requires support",
        crisisDetected: false,
      };
    }

    // Step 3: Content-based mode detection
    const analyticalScore = this.matchPatterns(messageContent, this.ANALYTICAL_PATTERNS);
    const goalStrategyScore = this.matchPatterns(messageContent, this.GOAL_STRATEGY_PATTERNS);
    const taskScore = this.matchPatterns(messageContent, this.TASK_PATTERNS);
    const infoScore = this.matchPatterns(messageContent, this.INFO_PATTERNS);

    this.logger.debug("[ConversationModeService] Pattern matching scores", {
      analyticalScore,
      goalStrategyScore,
      taskScore,
      infoScore,
    });

    // Find the highest scoring mode
    const scores = [
      { mode: ConversationMode.ANALYTICAL_DEEP_DIVE, score: analyticalScore },
      { mode: ConversationMode.GOAL_STRATEGY, score: goalStrategyScore },
      { mode: ConversationMode.TASK_EXECUTION, score: taskScore },
      { mode: ConversationMode.INFORMATION_RETRIEVAL, score: infoScore },
    ];

    const highestScore = scores.reduce((prev, current) =>
      current.score > prev.score ? current : prev
    );

    // If any pattern scores above threshold, use that mode
    if (highestScore.score >= 0.3) {
      return {
        mode: highestScore.mode,
        confidence: Math.min(highestScore.score, 1.0),
        reasoning: this.getModeReasoning(highestScore.mode),
        crisisDetected: false,
      };
    }

    // Step 4: Default to conversational mode
    return {
      mode: ConversationMode.CONVERSATIONAL,
      confidence: 0.7,
      reasoning: "General conversation without specific task or high emotional intensity",
      crisisDetected: false,
    };
  }

  /**
   * Detects crisis situations based on message content and emotional intensity
   *
   * @param messageContent - The message text to analyze
   * @param intensity - Emotional intensity (0.0 to 1.0)
   * @returns true if crisis indicators are detected
   */
  private detectCrisis(messageContent: string, intensity: number): boolean {
    // Check for crisis patterns in message
    const hasCrisisPattern = this.CRISIS_PATTERNS.some((pattern) =>
      pattern.test(messageContent)
    );

    // Crisis requires both high intensity AND crisis language
    const crisisDetected = hasCrisisPattern && intensity >= 0.85;

    if (crisisDetected) {
      this.logger.warn("[ConversationModeService] CRISIS DETECTED", {
        intensity,
        hasCrisisPattern,
      });
    }

    return crisisDetected;
  }

  /**
   * Calculates pattern match score for a given set of patterns
   *
   * @param text - The text to analyze
   * @param patterns - Array of regex patterns to match
   * @returns Score between 0.0 and 1.0
   */
  private matchPatterns(text: string, patterns: RegExp[]): number {
    let matchCount = 0;

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matchCount += matches.length;
      }
    }

    // Normalize score (cap at 1.0)
    // Each match adds 0.25 to the score
    return Math.min(matchCount * 0.25, 1.0);
  }

  /**
   * Calculates confidence score based on intensity and thresholds
   *
   * @param value - The current value
   * @param minThreshold - Minimum threshold for the mode
   * @param maxThreshold - Maximum threshold for full confidence
   * @returns Confidence score between 0.0 and 1.0
   */
  private calculateConfidence(
    value: number,
    minThreshold: number,
    maxThreshold: number
  ): number {
    if (value >= maxThreshold) return 1.0;
    if (value <= minThreshold) return 0.5;

    // Linear interpolation between min and max
    const range = maxThreshold - minThreshold;
    const position = value - minThreshold;
    return 0.5 + (position / range) * 0.5;
  }

  /**
   * Gets human-readable reasoning for each mode
   */
  private getModeReasoning(mode: ConversationMode): string {
    switch (mode) {
      case ConversationMode.ANALYTICAL_DEEP_DIVE:
        return "User is seeking analysis, patterns, or deeper understanding";
      case ConversationMode.GOAL_STRATEGY:
        return "User is planning, strategizing, or setting goals";
      case ConversationMode.TASK_EXECUTION:
        return "User wants to execute tasks or take action";
      case ConversationMode.INFORMATION_RETRIEVAL:
        return "User is seeking specific information or facts";
      default:
        return "General conversation mode";
    }
  }

  /**
   * Gets recommended response strategy for each mode
   * This can be used by the AI to adapt its response style
   */
  getResponseStrategy(mode: ConversationMode): {
    tone: string;
    focus: string;
    actionables: string[];
  } {
    switch (mode) {
      case ConversationMode.CRISIS_INTERVENTION:
        return {
          tone: "calm, supportive, immediate",
          focus: "Safety and immediate support resources",
          actionables: [
            "Provide crisis hotline numbers",
            "Encourage professional help",
            "Express concern and support",
            "Do not leave user alone",
          ],
        };

      case ConversationMode.EMOTIONAL_SUPPORT:
        return {
          tone: "empathetic, validating, warm",
          focus: "Emotional validation and understanding",
          actionables: [
            "Validate feelings",
            "Offer emotional support",
            "Ask open-ended questions",
            "Provide coping strategies",
          ],
        };

      case ConversationMode.ANALYTICAL_DEEP_DIVE:
        return {
          tone: "analytical, thorough, insightful",
          focus: "Pattern analysis and deeper understanding",
          actionables: [
            "Identify patterns in emotional data",
            "Provide insights and connections",
            "Offer detailed explanations",
            "Suggest areas for exploration",
          ],
        };

      case ConversationMode.GOAL_STRATEGY:
        return {
          tone: "motivating, strategic, forward-looking",
          focus: "Goal setting and planning",
          actionables: [
            "Help define clear goals",
            "Break down into actionable steps",
            "Identify potential obstacles",
            "Provide encouragement",
          ],
        };

      case ConversationMode.TASK_EXECUTION:
        return {
          tone: "direct, action-oriented, clear",
          focus: "Concrete next steps and actions",
          actionables: [
            "Provide clear action items",
            "Prioritize tasks",
            "Set deadlines",
            "Track completion",
          ],
        };

      case ConversationMode.INFORMATION_RETRIEVAL:
        return {
          tone: "informative, precise, helpful",
          focus: "Accurate information delivery",
          actionables: [
            "Provide factual information",
            "Cite sources when possible",
            "Offer related information",
            "Clarify ambiguities",
          ],
        };

      case ConversationMode.CONVERSATIONAL:
      default:
        return {
          tone: "friendly, natural, balanced",
          focus: "General engagement and connection",
          actionables: [
            "Maintain natural conversation flow",
            "Ask follow-up questions",
            "Show interest and engagement",
            "Adapt to user's needs",
          ],
        };
    }
  }
}
