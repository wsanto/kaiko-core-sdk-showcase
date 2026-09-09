import { ConversationModeService, ConversationMode } from "./conversation-mode.service";
import { Logger } from "winston";

describe("ConversationModeService", () => {
  let service: ConversationModeService;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    service = new ConversationModeService(mockLogger);
  });

  describe("Crisis Detection", () => {
    it("should detect crisis mode with suicidal language and high intensity", () => {
      const result = service.detectMode(
        0.9,
        -0.8,
        "I feel like killing myself, there's no way out"
      );

      expect(result.mode).toBe(ConversationMode.CRISIS_INTERVENTION);
      expect(result.crisisDetected).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("CRISIS DETECTED"),
        expect.any(Object)
      );
    });

    it("should detect crisis mode with self-harm language", () => {
      const result = service.detectMode(
        0.87,
        -0.7,
        "I've been cutting myself and I can't stop hurting myself"
      );

      expect(result.mode).toBe(ConversationMode.CRISIS_INTERVENTION);
      expect(result.crisisDetected).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it("should detect crisis mode with hopelessness", () => {
      const result = service.detectMode(
        0.95,
        -0.9,
        "I'm completely hopeless, I can't go on anymore"
      );

      expect(result.mode).toBe(ConversationMode.CRISIS_INTERVENTION);
      expect(result.crisisDetected).toBe(true);
    });

    it("should NOT detect crisis without high intensity", () => {
      const result = service.detectMode(
        0.5,
        -0.3,
        "Sometimes I feel like giving up"
      );

      expect(result.mode).not.toBe(ConversationMode.CRISIS_INTERVENTION);
      expect(result.crisisDetected).toBe(false);
    });

    it("should NOT detect crisis without crisis language", () => {
      const result = service.detectMode(
        0.9,
        -0.8,
        "I'm really upset about this situation"
      );

      expect(result.mode).not.toBe(ConversationMode.CRISIS_INTERVENTION);
      expect(result.crisisDetected).toBe(false);
    });
  });

  describe("Emotional Support Mode", () => {
    it("should detect emotional support mode with high intensity and negative valence", () => {
      const result = service.detectMode(
        0.75,
        -0.5,
        "I'm feeling really sad and overwhelmed"
      );

      expect(result.mode).toBe(ConversationMode.EMOTIONAL_SUPPORT);
      expect(result.crisisDetected).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should detect emotional support at threshold intensity", () => {
      const result = service.detectMode(
        0.65,
        -0.4,
        "I'm struggling with my emotions today"
      );

      expect(result.mode).toBe(ConversationMode.EMOTIONAL_SUPPORT);
    });

    it("should NOT detect emotional support with low intensity", () => {
      const result = service.detectMode(
        0.4,
        -0.5,
        "I'm a bit sad"
      );

      expect(result.mode).not.toBe(ConversationMode.EMOTIONAL_SUPPORT);
    });

    it("should NOT detect emotional support with positive valence", () => {
      const result = service.detectMode(
        0.75,
        0.5,
        "I'm feeling great!"
      );

      expect(result.mode).not.toBe(ConversationMode.EMOTIONAL_SUPPORT);
    });
  });

  describe("Analytical Deep Dive Mode", () => {
    it("should detect analytical mode with analysis keywords", () => {
      const result = service.detectMode(
        0.5,
        0.0,
        "Can you help me analyze the patterns in my emotional responses?"
      );

      expect(result.mode).toBe(ConversationMode.ANALYTICAL_DEEP_DIVE);
      expect(result.crisisDetected).toBe(false);
      expect(result.reasoning).toContain("analysis");
    });

    it("should detect analytical mode with understanding keywords", () => {
      const result = service.detectMode(
        0.4,
        0.1,
        "I want to understand why I feel this way"
      );

      expect(result.mode).toBe(ConversationMode.ANALYTICAL_DEEP_DIVE);
    });

    it("should detect analytical mode with exploration keywords", () => {
      const result = service.detectMode(
        0.5,
        0.0,
        "Let's explore the relationship between my stress and productivity"
      );

      expect(result.mode).toBe(ConversationMode.ANALYTICAL_DEEP_DIVE);
    });
  });

  describe("Goal Strategy Mode", () => {
    it("should detect goal strategy mode with planning keywords", () => {
      const result = service.detectMode(
        0.5,
        0.2,
        "I want to create a strategy and plan my goals for improving my emotional health"
      );

      expect(result.mode).toBe(ConversationMode.GOAL_STRATEGY);
      expect(result.reasoning).toContain("planning");
    });

    it("should detect goal strategy mode with strategy keywords", () => {
      const result = service.detectMode(
        0.4,
        0.1,
        "What's the best strategy to achieve better work-life balance?"
      );

      expect(result.mode).toBe(ConversationMode.GOAL_STRATEGY);
    });

    it("should detect goal strategy mode with future planning", () => {
      const result = service.detectMode(
        0.5,
        0.3,
        "I need a roadmap for my future development"
      );

      expect(result.mode).toBe(ConversationMode.GOAL_STRATEGY);
    });
  });

  describe("Task Execution Mode", () => {
    it("should detect task execution mode with action keywords", () => {
      const result = service.detectMode(
        0.5,
        0.0,
        "I need to create a plan and execute it now"
      );

      expect(result.mode).toBe(ConversationMode.TASK_EXECUTION);
      expect(result.reasoning).toContain("execute");
    });

    it("should detect task execution mode with urgency", () => {
      const result = service.detectMode(
        0.6,
        0.1,
        "I need to do this immediately, it's urgent"
      );

      expect(result.mode).toBe(ConversationMode.TASK_EXECUTION);
    });

    it("should detect task execution mode with completion keywords", () => {
      const result = service.detectMode(
        0.4,
        0.0,
        "Help me complete this task and finish the todo list"
      );

      expect(result.mode).toBe(ConversationMode.TASK_EXECUTION);
    });
  });

  describe("Information Retrieval Mode", () => {
    it("should detect information retrieval with question words", () => {
      const result = service.detectMode(
        0.3,
        0.0,
        "What are the symptoms of anxiety?"
      );

      expect(result.mode).toBe(ConversationMode.INFORMATION_RETRIEVAL);
      expect(result.reasoning).toContain("information");
    });

    it("should detect information retrieval with search keywords", () => {
      const result = service.detectMode(
        0.4,
        0.0,
        "Can you find information about emotional regulation techniques?"
      );

      expect(result.mode).toBe(ConversationMode.INFORMATION_RETRIEVAL);
    });

    it("should detect information retrieval with query patterns", () => {
      const result = service.detectMode(
        0.3,
        0.1,
        "Tell me about the different types of emotions"
      );

      expect(result.mode).toBe(ConversationMode.INFORMATION_RETRIEVAL);
    });
  });

  describe("Conversational Mode", () => {
    it("should default to conversational mode for general chat", () => {
      const result = service.detectMode(
        0.4,
        0.2,
        "Hello, nice to speak with you!"
      );

      expect(result.mode).toBe(ConversationMode.CONVERSATIONAL);
      expect(result.crisisDetected).toBe(false);
      expect(result.confidence).toBe(0.7);
    });

    it("should use conversational mode when no patterns match", () => {
      const result = service.detectMode(
        0.5,
        0.0,
        "That's interesting, I hadn't thought about it that way"
      );

      expect(result.mode).toBe(ConversationMode.CONVERSATIONAL);
    });

    it("should use conversational mode for low intensity emotions", () => {
      const result = service.detectMode(
        0.3,
        0.1,
        "Nice weather we're having"
      );

      expect(result.mode).toBe(ConversationMode.CONVERSATIONAL);
    });
  });

  describe("Mode Priority", () => {
    it("should prioritize crisis over all other modes", () => {
      const result = service.detectMode(
        0.9,
        -0.8,
        "I want to analyze my feelings but I'm suicidal and hopeless"
      );

      expect(result.mode).toBe(ConversationMode.CRISIS_INTERVENTION);
      expect(result.crisisDetected).toBe(true);
    });

    it("should prioritize emotional support over content-based modes", () => {
      const result = service.detectMode(
        0.7,
        -0.5,
        "Can you analyze why I want to set goals?"
      );

      expect(result.mode).toBe(ConversationMode.EMOTIONAL_SUPPORT);
    });

    it("should select highest scoring content mode", () => {
      const result = service.detectMode(
        0.5,
        0.0,
        "I need to analyze and understand my goals"
      );

      // Should pick one of the modes based on pattern matching
      expect([
        ConversationMode.ANALYTICAL_DEEP_DIVE,
        ConversationMode.GOAL_STRATEGY,
      ]).toContain(result.mode);
    });
  });

  describe("Confidence Scoring", () => {
    it("should return maximum confidence for crisis", () => {
      const result = service.detectMode(
        0.95,
        -0.9,
        "I'm suicidal"
      );

      expect(result.confidence).toBe(1.0);
    });

    it("should scale confidence for emotional support based on intensity", () => {
      const lowIntensity = service.detectMode(0.65, -0.4, "I'm sad");
      const highIntensity = service.detectMode(0.85, -0.6, "I'm devastated");

      expect(highIntensity.confidence).toBeGreaterThan(lowIntensity.confidence);
    });

    it("should increase confidence with more pattern matches", () => {
      const singleMatch = service.detectMode(
        0.5,
        0.0,
        "I want to analyze this"
      );
      const multipleMatches = service.detectMode(
        0.5,
        0.0,
        "I want to analyze the patterns and understand the trends in my data"
      );

      expect(multipleMatches.confidence).toBeGreaterThanOrEqual(singleMatch.confidence);
    });
  });

  describe("Response Strategy", () => {
    it("should provide crisis intervention strategy", () => {
      const strategy = service.getResponseStrategy(ConversationMode.CRISIS_INTERVENTION);

      expect(strategy.tone).toContain("calm");
      expect(strategy.focus).toContain("Safety");
      expect(strategy.actionables.some(item => /crisis|hotline/i.test(item))).toBe(true);
    });

    it("should provide emotional support strategy", () => {
      const strategy = service.getResponseStrategy(ConversationMode.EMOTIONAL_SUPPORT);

      expect(strategy.tone).toContain("empathetic");
      expect(strategy.actionables.some(item => /validate/i.test(item))).toBe(true);
    });

    it("should provide analytical strategy", () => {
      const strategy = service.getResponseStrategy(ConversationMode.ANALYTICAL_DEEP_DIVE);

      expect(strategy.tone).toContain("analytical");
      expect(strategy.focus).toContain("Pattern");
    });

    it("should provide goal strategy guidance", () => {
      const strategy = service.getResponseStrategy(ConversationMode.GOAL_STRATEGY);

      expect(strategy.tone).toContain("motivating");
      expect(strategy.actionables.some(item => /goal/i.test(item))).toBe(true);
    });

    it("should provide task execution strategy", () => {
      const strategy = service.getResponseStrategy(ConversationMode.TASK_EXECUTION);

      expect(strategy.tone).toContain("action-oriented");
      expect(strategy.actionables.some(item => /action|task/i.test(item))).toBe(true);
    });

    it("should provide information retrieval strategy", () => {
      const strategy = service.getResponseStrategy(ConversationMode.INFORMATION_RETRIEVAL);

      expect(strategy.tone).toContain("informative");
      expect(strategy.actionables.some(item => /information/i.test(item))).toBe(true);
    });

    it("should provide conversational strategy", () => {
      const strategy = service.getResponseStrategy(ConversationMode.CONVERSATIONAL);

      expect(strategy.tone).toContain("friendly");
      expect(strategy.focus).toContain("engagement");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty message", () => {
      const result = service.detectMode(0.5, 0.0, "");

      expect(result.mode).toBe(ConversationMode.CONVERSATIONAL);
      expect(result.crisisDetected).toBe(false);
    });

    it("should handle very long message", () => {
      const longMessage = "analyze ".repeat(1000);
      const result = service.detectMode(0.5, 0.0, longMessage);

      expect(result.mode).toBe(ConversationMode.ANALYTICAL_DEEP_DIVE);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it("should handle boundary intensity values", () => {
      const min = service.detectMode(0.0, 0.0, "test");
      const max = service.detectMode(1.0, 1.0, "test");

      expect(min.mode).toBeDefined();
      expect(max.mode).toBeDefined();
    });

    it("should handle boundary valence values", () => {
      const negative = service.detectMode(0.7, -1.0, "sad");
      const positive = service.detectMode(0.7, 1.0, "happy");

      expect(negative.mode).toBe(ConversationMode.EMOTIONAL_SUPPORT);
      expect(positive.mode).not.toBe(ConversationMode.EMOTIONAL_SUPPORT);
    });

    it("should handle mixed case keywords", () => {
      const upper = service.detectMode(0.5, 0.0, "ANALYZE THIS PATTERN");
      const lower = service.detectMode(0.5, 0.0, "analyze this pattern");

      expect(upper.mode).toBe(lower.mode);
    });
  });
});
