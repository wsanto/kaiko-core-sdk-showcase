import { injectable, inject } from "tsyringe";
import { Logger } from "winston";
import { EmotionItemV2 } from "./types.v2";

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
 * Response Guidance
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
 * Personality Mode Detection Result
 */
export interface PersonalityModeResult {
  mode: PersonalityMode;
  confidence: number;
  reasoning: string;
  responseGuidance: ResponseGuidance;
}

/**
 * Personality Mode Service (Phase 6.5)
 * Detects appropriate personality mode based on emotional state and message context
 */
@injectable()
export class PersonalityModeService {
  constructor(@inject("LOGGER") private logger: Logger) {}

  /**
   * Detect personality mode based on emotional state and message content
   * Reference: anima_agentkit/personality.py determine_prompt_type()
   */
  detectMode(
    emotionData: EmotionItemV2,
    messageText: string
  ): PersonalityModeResult {
    const { category, intensity, valence } = emotionData;

    // Crisis detection (highest priority)
    if (this.isCrisisMode(category, intensity)) {
      return {
        mode: PersonalityMode.CRISIS,
        confidence: 0.95,
        reasoning: `High intensity ${category} detected (${(intensity ?? 0).toFixed(2)}) - crisis intervention needed`,
        responseGuidance: this.getCrisisGuidance(),
      };
    }

    // Therapeutic mode
    if (this.isTherapeuticMode(category, intensity)) {
      return {
        mode: PersonalityMode.THERAPEUTIC,
        confidence: 0.85,
        reasoning: `Elevated ${category} detected (${(intensity ?? 0).toFixed(2)}) - therapeutic support needed`,
        responseGuidance: this.getTherapeuticGuidance(),
      };
    }

    // Coaching mode
    if (this.isCoachingMode(category, intensity, valence)) {
      return {
        mode: PersonalityMode.COACHING,
        confidence: 0.80,
        reasoning: `Positive energy detected - coaching mode for goal pursuit`,
        responseGuidance: this.getCoachingGuidance(),
      };
    }

    // Analytical mode
    if (this.isAnalyticalMode(messageText)) {
      return {
        mode: PersonalityMode.ANALYTICAL,
        confidence: 0.75,
        reasoning: `Analytical query detected - deep dive mode`,
        responseGuidance: this.getAnalyticalGuidance(),
      };
    }

    // Minimal/Task mode
    if (this.isMinimalMode(messageText)) {
      return {
        mode: PersonalityMode.MINIMAL,
        confidence: 0.70,
        reasoning: `Task execution request - minimal mode`,
        responseGuidance: this.getMinimalGuidance(),
      };
    }

    // Conversational mode (low intensity)
    if (intensity <= 0.3) {
      return {
        mode: PersonalityMode.CONVERSATIONAL,
        confidence: 0.65,
        reasoning: `Low emotional intensity - conversational mode`,
        responseGuidance: this.getConversationalGuidance(),
      };
    }

    // Default: Core mode
    return {
      mode: PersonalityMode.CORE,
      confidence: 0.60,
      reasoning: `Standard emotional context - core mode`,
      responseGuidance: this.getCoreGuidance(),
    };
  }

  /**
   * Crisis mode detection
   * Triggered by high-intensity negative emotions
   */
  private isCrisisMode(emotion: string, intensity: number): boolean {
    const crisisEmotions = ['anger', 'fear', 'sadness', 'despair', 'anxiety'];
    return intensity >= 0.85 && crisisEmotions.includes(emotion);
  }

  /**
   * Therapeutic mode detection
   * Triggered by elevated negative emotions
   */
  private isTherapeuticMode(emotion: string, intensity: number): boolean {
    const therapeuticEmotions = ['sadness', 'anger', 'fear', 'despair'];
    return intensity >= 0.65 && therapeuticEmotions.includes(emotion);
  }

  /**
   * Coaching mode detection
   * Triggered by positive emotions with good energy
   */
  private isCoachingMode(emotion: string, intensity: number, valence: number): boolean {
    const coachingEmotions = ['joy', 'love', 'anticipation', 'surprise'];
    return intensity >= 0.4 && intensity <= 0.8 && coachingEmotions.includes(emotion) && valence > 0.3;
  }

  /**
   * Analytical mode detection
   * Triggered by analytical keywords in message
   */
  private isAnalyticalMode(text: string): boolean {
    const analyticalKeywords = [
      'analyze', 'pattern', 'trend', 'data', 'insight',
      'compare', 'correlation', 'why', 'how does'
    ];
    const lowerText = text.toLowerCase();
    return analyticalKeywords.some(kw => lowerText.includes(kw));
  }

  /**
   * Minimal mode detection
   * Triggered by short task-oriented commands
   */
  private isMinimalMode(text: string): boolean {
    const taskKeywords = ['list', 'show', 'get', 'fetch', 'display'];
    const lowerText = text.toLowerCase();
    return taskKeywords.some(kw => lowerText.startsWith(kw)) && text.split(' ').length <= 5;
  }

  // ============================================================================
  // Response Guidance Methods
  // ============================================================================

  /**
   * Crisis guidance: Calm, grounding, safety-focused
   */
  private getCrisisGuidance(): ResponseGuidance {
    return {
      tone: 'calm, grounding, reassuring',
      focus: 'Immediate safety and emotional grounding',
      speechPatterns: [
        'Take a deep breath',
        'I\'m here with you',
        'Let\'s slow down for a moment',
        'You\'re safe right now'
      ],
      prohibitions: [
        'Do not minimize their feelings',
        'Do not rush to solutions',
        'Do not use humor',
        'Avoid complex language'
      ],
      exampleResponses: [
        'I can hear that you\'re in a lot of pain right now. Let\'s take this one moment at a time.',
        'What you\'re feeling is valid. Can we focus on what feels safest for you right now?'
      ],
    };
  }

  /**
   * Therapeutic guidance: Empathetic, validating, exploratory
   */
  private getTherapeuticGuidance(): ResponseGuidance {
    return {
      tone: 'empathetic, validating, exploratory',
      focus: 'Emotional validation and gentle exploration',
      speechPatterns: [
        'That sounds really hard',
        'I hear you',
        'It makes sense that you\'re feeling this way',
        'Tell me more about that'
      ],
      prohibitions: [
        'Do not offer quick fixes',
        'Avoid toxic positivity',
        'Do not compare to others',
        'Avoid judgmental language'
      ],
      exampleResponses: [
        'It sounds like you\'re carrying a lot right now. What feels most important to talk about?',
        'That must be really difficult. How are you holding up with all of this?'
      ],
    };
  }

  /**
   * Coaching guidance: Motivational, strategic, action-oriented
   */
  private getCoachingGuidance(): ResponseGuidance {
    return {
      tone: 'motivational, strategic, action-oriented',
      focus: 'Goal achievement and momentum building',
      speechPatterns: [
        'Let\'s break this down',
        'What\'s the next step?',
        'You\'ve got this',
        'Great progress!'
      ],
      prohibitions: [
        'Do not ignore emotional context',
        'Avoid being overly pushy',
        'Do not dismiss concerns',
        'Avoid unrealistic expectations'
      ],
      exampleResponses: [
        'You\'re making great progress! Let\'s map out the next milestone together.',
        'I can see your energy around this. What would make the biggest impact right now?'
      ],
    };
  }

  /**
   * Analytical guidance: Thorough, evidence-based, pattern-focused
   */
  private getAnalyticalGuidance(): ResponseGuidance {
    return {
      tone: 'analytical, thorough, evidence-based',
      focus: 'Patterns, insights, and deep understanding',
      speechPatterns: [
        'Looking at the data...',
        'I notice a pattern here',
        'This correlates with...',
        'Based on your history...'
      ],
      prohibitions: [
        'Do not be overly technical without context',
        'Avoid data dumping',
        'Do not ignore emotional undertones',
        'Avoid jargon without explanation'
      ],
      exampleResponses: [
        'Analyzing your emotional patterns over the past month, I notice a clear trend...',
        'There\'s an interesting correlation between your stress levels and Monday mornings...'
      ],
    };
  }

  /**
   * Minimal guidance: Direct, efficient, task-focused
   */
  private getMinimalGuidance(): ResponseGuidance {
    return {
      tone: 'direct, efficient, clear',
      focus: 'Quick execution and clear information',
      speechPatterns: [
        'Here\'s what you asked for',
        'Done',
        'Got it',
        'Here are the results'
      ],
      prohibitions: [
        'Do not over-explain',
        'Avoid unnecessary conversation',
        'Do not add unsolicited advice',
        'Avoid lengthy responses'
      ],
      exampleResponses: [
        'Here are your active goals: [list]',
        'Done. I\'ve updated your settings.'
      ],
    };
  }

  /**
   * Conversational guidance: Warm, casual, engaging
   */
  private getConversationalGuidance(): ResponseGuidance {
    return {
      tone: 'warm, casual, engaging',
      focus: 'Natural dialogue and connection',
      speechPatterns: [
        'Well,', 'So,', 'Hmm,', 'Actually,',
        'You know what?', 'That\'s interesting',
        'Oh wow', 'Really?'
      ],
      prohibitions: [
        'Do not be overly formal',
        'Avoid robotic language',
        'Do not over-structure',
        'Avoid being too serious'
      ],
      exampleResponses: [
        'Well, that\'s an interesting question. I\'ve been thinking about that too...',
        'Oh wow, I hadn\'t considered it from that angle. Tell me more...'
      ],
    };
  }

  /**
   * Core guidance: Balanced, thoughtful, authentic
   */
  private getCoreGuidance(): ResponseGuidance {
    return {
      tone: 'balanced, thoughtful, authentic',
      focus: 'Integrated emotional and rational support',
      speechPatterns: [
        'I\'m curious about...',
        'It seems like...',
        'I\'m noticing...',
        'Let\'s explore...'
      ],
      prohibitions: [
        'Do not be generic',
        'Avoid formulaic responses',
        'Do not ignore emotional context',
        'Avoid being overly clinical'
      ],
      exampleResponses: [
        'I\'m noticing some interesting layers to what you\'re sharing. Let\'s unpack that together.',
        'It seems like there\'s a lot going on beneath the surface here. What\'s most important to you?'
      ],
    };
  }
}
