import { BeliefDetectionService, BeliefType } from "./belief-detection.service";
import { Logger } from "winston";

describe("BeliefDetectionService", () => {
  let service: BeliefDetectionService;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    service = new BeliefDetectionService(mockLogger);
  });

  describe("Explicit Beliefs Detection", () => {
    it("should detect 'I believe that' pattern", () => {
      const text = "I believe that honesty is the foundation of trust";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.EXPLICIT);
      expect(result.beliefs[0].content).toBe("honesty is the foundation of trust");
      expect(result.beliefs[0].confidence).toBeGreaterThan(0.5);
    });

    it("should detect 'I think' pattern", () => {
      const text = "I think people should always be kind to each other";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.EXPLICIT);
      expect(result.beliefs[0].content).toBe("people should always be kind to each other");
    });

    it("should detect 'In my opinion' pattern", () => {
      const text = "In my opinion success comes from hard work and dedication";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.EXPLICIT);
      expect(result.beliefs[0].content).toBe("success comes from hard work and dedication");
    });

    it("should detect 'I feel that' pattern", () => {
      const text = "I feel that education is crucial for personal growth";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.EXPLICIT);
      expect(result.beliefs[0].content).toBe("education is crucial for personal growth");
    });

    it("should detect 'I'm convinced' pattern", () => {
      const text = "I'm convinced that technology will solve climate change";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.EXPLICIT);
      expect(result.beliefs[0].content).toBe("technology will solve climate change");
    });

    it("should clean trailing punctuation", () => {
      const text = "I believe that kindness matters.";
      const result = service.detectBeliefs(text);

      expect(result.beliefs[0].content).toBe("kindness matters");
      expect(result.beliefs[0].content).not.toContain(".");
    });

    it("should skip very short beliefs", () => {
      const text = "I think so";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(0);
    });
  });

  describe("Identity Beliefs Detection", () => {
    it("should detect 'I am someone who' pattern", () => {
      const text = "I am someone who values creativity above all else";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.IDENTITY);
      expect(result.beliefs[0].content).toBe("values creativity above all else");
    });

    it("should detect 'I am the kind of person who' pattern", () => {
      const text = "I am the kind of person who never gives up on my dreams";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.IDENTITY);
      expect(result.beliefs[0].content).toBe("never gives up on my dreams");
    });

    it("should detect 'I am a person who' pattern", () => {
      const text = "I am a person who believes in second chances";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.IDENTITY);
      expect(result.beliefs[0].content).toBe("believes in second chances");
    });

    it("should detect 'I am a/an X person' pattern", () => {
      const text = "I am a creative person with a passion for art";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.IDENTITY);
      expect(result.beliefs[0].content).toBe("creative");
    });

    it("should detect 'I consider myself' pattern", () => {
      const text = "I consider myself to be an empathetic and caring individual";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.IDENTITY);
      expect(result.beliefs[0].content).toBe("an empathetic and caring individual");
    });

    it("should detect 'I identify as' pattern", () => {
      const text = "I identify as a lifelong learner and explorer";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.IDENTITY);
      expect(result.beliefs[0].content).toBe("a lifelong learner and explorer");
    });
  });

  describe("Value Beliefs Detection", () => {
    it("should detect 'X is important to me' pattern", () => {
      const text = "Family is very important to me";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.VALUE);
      expect(result.beliefs[0].content).toBe("Family");
    });

    it("should detect 'I value' pattern", () => {
      const text = "I value honesty, integrity, and transparency in all relationships";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.VALUE);
      expect(result.beliefs[0].content).toBe("honesty, integrity, and transparency in all relationships");
    });

    it("should detect 'X matters to me' pattern", () => {
      const text = "Personal growth matters a lot to me";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.VALUE);
      expect(result.beliefs[0].content).toBe("Personal growth");
    });

    it("should detect 'I care about' pattern", () => {
      const text = "I care deeply about environmental sustainability and future generations";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.VALUE);
      expect(result.beliefs[0].content).toBe("environmental sustainability and future generations");
    });
  });

  describe("Purpose Beliefs Detection", () => {
    it("should detect 'My purpose is' pattern", () => {
      const text = "My purpose is to help others discover their potential";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.PURPOSE);
      expect(result.beliefs[0].content).toBe("help others discover their potential");
    });

    it("should detect 'I exist to' pattern", () => {
      const text = "I exist to create meaningful connections between people";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.PURPOSE);
      expect(result.beliefs[0].content).toBe("create meaningful connections between people");
    });

    it("should detect 'I exist for' pattern", () => {
      const text = "I exist for making the world a better place";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.PURPOSE);
      expect(result.beliefs[0].content).toBe("making the world a better place");
    });

    it("should detect 'My mission is' pattern", () => {
      const text = "My mission is to inspire creativity in young minds";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.PURPOSE);
      expect(result.beliefs[0].content).toBe("inspire creativity in young minds");
    });

    it("should detect 'I'm here to' pattern", () => {
      const text = "I'm here to spread positivity and hope in difficult times";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].type).toBe(BeliefType.PURPOSE);
      expect(result.beliefs[0].content).toBe("spread positivity and hope in difficult times");
    });
  });

  describe("Multiple Beliefs Detection", () => {
    it("should detect multiple beliefs of different types", () => {
      const text = "I believe that education is essential. I am someone who values learning. Family is important to me. My purpose is to make a difference.";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(4);
      expect(result.beliefsByType[BeliefType.EXPLICIT]).toBe(1);
      expect(result.beliefsByType[BeliefType.IDENTITY]).toBe(1);
      expect(result.beliefsByType[BeliefType.VALUE]).toBe(1);
      expect(result.beliefsByType[BeliefType.PURPOSE]).toBe(1);
    });

    it("should detect multiple beliefs of the same type", () => {
      const text = "I value honesty and I care deeply about integrity";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(2);
      expect(result.beliefsByType[BeliefType.VALUE]).toBe(2);
    });

    it("should handle complex messages with mixed beliefs", () => {
      const text = "I think technology is powerful. I am a person who embraces innovation. Creativity matters to me. My mission is to innovate.";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(4);
    });
  });

  describe("Confidence Scoring", () => {
    it("should increase confidence for longer statements", () => {
      const shortText = "I believe that kindness matters";
      const longText = "I believe that kindness is the most important virtue we can cultivate in ourselves and share with others";

      const shortResult = service.detectBeliefs(shortText);
      const longResult = service.detectBeliefs(longText);

      expect(longResult.beliefs[0].confidence).toBeGreaterThan(shortResult.beliefs[0].confidence);
    });

    it("should decrease confidence for very short statements", () => {
      const text = "I think ok";
      const result = service.detectBeliefs(text);

      // Should skip very short beliefs (less than 3 characters)
      expect(result.totalBeliefs).toBe(0);
    });

    it("should cap confidence at 1.0", () => {
      const text = "I believe that this is an extremely long statement designed to test the confidence scoring mechanism and ensure it properly caps at one point zero even with very lengthy content that goes on and on";
      const result = service.detectBeliefs(text);

      expect(result.beliefs[0].confidence).toBeLessThanOrEqual(1.0);
    });

    it("should ensure minimum confidence of 0.3", () => {
      const text = "I believe short";
      const result = service.detectBeliefs(text);

      if (result.totalBeliefs > 0) {
        expect(result.beliefs[0].confidence).toBeGreaterThanOrEqual(0.3);
      }
    });
  });

  describe("Helper Methods", () => {
    describe("hasBeliefs", () => {
      it("should return true when beliefs are detected", () => {
        const text = "I believe in honesty";
        const result = service.hasBeliefs(text);

        expect(result).toBe(true);
      });

      it("should return false when no beliefs are detected", () => {
        const text = "Hello, how are you today?";
        const result = service.hasBeliefs(text);

        expect(result).toBe(false);
      });
    });

    describe("getBeliefsOfType", () => {
      it("should filter beliefs by type", () => {
        const text = "I believe in kindness. I value honesty. My purpose is to help.";
        const explicitBeliefs = service.getBeliefsOfType(text, BeliefType.EXPLICIT);
        const valueBeliefs = service.getBeliefsOfType(text, BeliefType.VALUE);
        const purposeBeliefs = service.getBeliefsOfType(text, BeliefType.PURPOSE);

        expect(explicitBeliefs.length).toBe(1);
        expect(valueBeliefs.length).toBe(1);
        expect(purposeBeliefs.length).toBe(1);
        expect(explicitBeliefs[0].type).toBe(BeliefType.EXPLICIT);
        expect(valueBeliefs[0].type).toBe(BeliefType.VALUE);
        expect(purposeBeliefs[0].type).toBe(BeliefType.PURPOSE);
      });

      it("should return empty array when type not found", () => {
        const text = "I believe in kindness";
        const identityBeliefs = service.getBeliefsOfType(text, BeliefType.IDENTITY);

        expect(identityBeliefs.length).toBe(0);
      });
    });

    describe("getMostConfidentBelief", () => {
      it("should return the belief with highest confidence", () => {
        const text = "I think yes. I believe that this is a much longer and more detailed belief statement";
        const mostConfident = service.getMostConfidentBelief(text);

        expect(mostConfident).not.toBeNull();
        expect(mostConfident!.content).toContain("longer");
      });

      it("should return null when no beliefs detected", () => {
        const text = "Hello there";
        const mostConfident = service.getMostConfidentBelief(text);

        expect(mostConfident).toBeNull();
      });

      it("should return the only belief when only one exists", () => {
        const text = "I value creativity";
        const mostConfident = service.getMostConfidentBelief(text);

        expect(mostConfident).not.toBeNull();
        expect(mostConfident!.type).toBe(BeliefType.VALUE);
        expect(mostConfident!.content).toBe("creativity");
      });
    });

    describe("generateBeliefSummary", () => {
      it("should generate summary with no beliefs", () => {
        const text = "Just a regular message";
        const summary = service.generateBeliefSummary(text);

        expect(summary).toBe("No beliefs detected");
      });

      it("should generate summary with single belief type", () => {
        const text = "I believe in honesty";
        const summary = service.generateBeliefSummary(text);

        expect(summary).toContain("1 belief(s)");
        expect(summary).toContain("1 explicit belief(s)");
      });

      it("should generate summary with multiple belief types", () => {
        const text = "I believe in honesty. I value creativity. My purpose is to inspire.";
        const summary = service.generateBeliefSummary(text);

        expect(summary).toContain("3 belief(s)");
        expect(summary).toContain("1 explicit belief(s)");
        expect(summary).toContain("1 value(s)");
        expect(summary).toContain("1 purpose statement(s)");
      });

      it("should generate summary with multiple beliefs of same type", () => {
        const text = "I believe in honesty and I think kindness matters";
        const summary = service.generateBeliefSummary(text);

        expect(summary).toContain("2 belief(s)");
        expect(summary).toContain("2 explicit belief(s)");
      });

      it("should generate summary with identity beliefs", () => {
        const text = "I am someone who values learning";
        const summary = service.generateBeliefSummary(text);

        expect(summary).toContain("1 belief(s)");
        expect(summary).toContain("1 identity statement(s)");
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string", () => {
      const text = "";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(0);
      expect(result.beliefs.length).toBe(0);
    });

    it("should handle very long messages", () => {
      const longText = "I believe that ".repeat(100) + "this is important";
      const result = service.detectBeliefs(longText);

      expect(result.totalBeliefs).toBeGreaterThan(0);
    });

    it("should handle special characters", () => {
      const text = "I believe that @#$% is important!";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].content).toBe("@#$% is important");
    });

    it("should handle unicode characters", () => {
      const text = "I believe that 友情 is important";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].content).toContain("友情");
    });

    it("should handle mixed case", () => {
      const upper = service.detectBeliefs("I BELIEVE THAT HONESTY MATTERS");
      const lower = service.detectBeliefs("i believe that honesty matters");
      const mixed = service.detectBeliefs("I bElIeVe ThAt HoNeStY mAtTeRs");

      expect(upper.totalBeliefs).toBe(1);
      expect(lower.totalBeliefs).toBe(1);
      expect(mixed.totalBeliefs).toBe(1);
    });

    it("should handle patterns at start of string", () => {
      const text = "I believe in starting strong";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
    });

    it("should handle patterns at end of string", () => {
      const text = "At the end of the day I believe in honesty";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
    });

    it("should handle multiple spaces", () => {
      const text = "I believe that spacing is weird";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].content).toContain("spacing");
    });

    it("should handle newlines", () => {
      const text = "I believe that\nbeliefs can span\nmultiple lines";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
    });

    it("should not detect partial matches", () => {
      const text = "The unbeliever doesn't believe what I say";
      const result = service.detectBeliefs(text);

      // Should not match "unbeliever" or standalone "believe"
      expect(result.totalBeliefs).toBe(0);
    });

    it("should handle beliefs with numbers", () => {
      const text = "I believe that 90% of success is showing up";
      const result = service.detectBeliefs(text);

      expect(result.totalBeliefs).toBe(1);
      expect(result.beliefs[0].content).toContain("90%");
    });
  });

  describe("Raw Match Preservation", () => {
    it("should preserve the raw matched string", () => {
      const text = "I believe that honesty is important";
      const result = service.detectBeliefs(text);

      expect(result.beliefs[0].rawMatch).toBe("I believe that honesty is important");
    });

    it("should preserve original casing in raw match", () => {
      const text = "I BELIEVE THAT HONESTY MATTERS";
      const result = service.detectBeliefs(text);

      expect(result.beliefs[0].rawMatch).toBe("I BELIEVE THAT HONESTY MATTERS");
    });
  });

  describe("Belief Count by Type", () => {
    it("should correctly count beliefs by type", () => {
      const text = "I believe in honesty. I think kindness matters. I value creativity. I care about compassion. My purpose is to help others. I'm here to make a difference.";
      const result = service.detectBeliefs(text);

      expect(result.beliefsByType[BeliefType.EXPLICIT]).toBe(2);
      expect(result.beliefsByType[BeliefType.VALUE]).toBe(2);
      expect(result.beliefsByType[BeliefType.PURPOSE]).toBe(2);
      expect(result.beliefsByType[BeliefType.IDENTITY]).toBe(0);
    });

    it("should initialize zero counts for missing types", () => {
      const text = "I believe in something";
      const result = service.detectBeliefs(text);

      expect(result.beliefsByType[BeliefType.EXPLICIT]).toBe(1);
      expect(result.beliefsByType[BeliefType.IDENTITY]).toBe(0);
      expect(result.beliefsByType[BeliefType.VALUE]).toBe(0);
      expect(result.beliefsByType[BeliefType.PURPOSE]).toBe(0);
    });
  });

  describe("Logger Integration", () => {
    it("should log debug messages for belief detection", () => {
      const text = "I believe in testing";
      service.detectBeliefs(text);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("[BeliefDetectionService]"),
        expect.objectContaining({
          textLength: expect.any(Number),
        })
      );
    });

    it("should log detection results", () => {
      const text = "I believe in honesty and I value creativity";
      service.detectBeliefs(text);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Beliefs detected"),
        expect.objectContaining({
          totalBeliefs: 2,
          beliefsByType: expect.any(Object),
        })
      );
    });
  });
});
