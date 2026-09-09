import "reflect-metadata";
import { EQAnalysisService } from "./eq-analysis.service";
import { RawEmotionScores } from "./types";

describe("EQAnalysisService", () => {
  let service: EQAnalysisService;

  beforeEach(() => {
    service = new EQAnalysisService();
  });

  describe("calculateValence", () => {
    it("should return positive valence for happy emotions", () => {
      const emotions: RawEmotionScores = {
        joy: 0.8,
        love: 0.6,
        sadness: 0.1,
        anger: 0.0,
        fear: 0.0,
        surprise: 0.2
      };

      const valence = service.calculateValence(emotions);
      expect(valence).toBeGreaterThan(0);
      expect(valence).toBeLessThanOrEqual(1);
    });

    it("should return negative valence for sad emotions", () => {
      const emotions: RawEmotionScores = {
        joy: 0.1,
        love: 0.0,
        sadness: 0.8,
        anger: 0.6,
        fear: 0.4,
        surprise: 0.0
      };

      const valence = service.calculateValence(emotions);
      expect(valence).toBeLessThan(0);
      expect(valence).toBeGreaterThanOrEqual(-1);
    });

    it("should return 0 for neutral emotions", () => {
      const emotions: RawEmotionScores = {
        joy: 0.0,
        love: 0.0,
        sadness: 0.0,
        anger: 0.0,
        fear: 0.0,
        surprise: 0.0
      };

      const valence = service.calculateValence(emotions);
      expect(valence).toBe(0);
    });
  });

  describe("calculateArousal", () => {
    it("should return high arousal for excited emotions", () => {
      const emotions: RawEmotionScores = {
        joy: 0.8,
        excitement: 0.7,
        surprise: 0.6,
        love: 0.2,
        sadness: 0.0,
        anger: 0.0,
        fear: 0.0
      };

      const arousal = service.calculateArousal(emotions);
      expect(arousal).toBeGreaterThan(0.6);
      expect(arousal).toBeLessThanOrEqual(1);
    });

    it("should return low arousal for calm emotions", () => {
      const emotions: RawEmotionScores = {
        sadness: 0.7,
        disappointment: 0.5,
        relief: 0.3,
        gratitude: 0.2,
        joy: 0.0,
        love: 0.0,
        anger: 0.0,
        fear: 0.0,
        surprise: 0.0
      };

      const arousal = service.calculateArousal(emotions);
      expect(arousal).toBeLessThan(0.35); // Low arousal: sadness(0.27), disappointment(0.35), relief(0.30), gratitude(0.45)
      expect(arousal).toBeGreaterThanOrEqual(0);
    });

    it("should return 0.5 for neutral arousal", () => {
      const emotions: RawEmotionScores = {
        joy: 0.0,
        love: 0.0,
        sadness: 0.0,
        anger: 0.0,
        fear: 0.0,
        surprise: 0.0
      };

      const arousal = service.calculateArousal(emotions);
      expect(arousal).toBe(0.5);
    });
  });

  describe("computeComplexity", () => {
    it('should return "simple" for single emotion', () => {
      const emotions: RawEmotionScores = {
        joy: 0.9,
        love: 0.05,
        sadness: 0.03,
        anger: 0.02,
        fear: 0.0,
        surprise: 0.0
      };

      expect(service.computeComplexity(emotions)).toBe("simple");
    });

    it('should return "layered" for two emotions', () => {
      const emotions: RawEmotionScores = {
        joy: 0.6,
        sadness: 0.4,
        love: 0.1,
        anger: 0.0,
        fear: 0.0,
        surprise: 0.0
      };

      expect(service.computeComplexity(emotions)).toBe("layered");
    });

    it('should return "paradoxical" for three emotions', () => {
      const emotions: RawEmotionScores = {
        joy: 0.5,
        sadness: 0.3,
        anger: 0.3,
        love: 0.1,
        fear: 0.0,
        surprise: 0.0
      };

      expect(service.computeComplexity(emotions)).toBe("paradoxical");
    });

    it('should return "transcendent" for four+ emotions', () => {
      const emotions: RawEmotionScores = {
        joy: 0.4,
        sadness: 0.3,
        anger: 0.3,
        fear: 0.3,
        love: 0.2,
        surprise: 0.0
      };

      expect(service.computeComplexity(emotions)).toBe("transcendent");
    });
  });

  describe("calculateWonderIndex", () => {
    it("should calculate wonder index from wonder emotions", () => {
      const emotions: RawEmotionScores = {
        wonder: 0.7,
        curiosity: 0.6,
        surprise: 0.5,
        anticipation: 0.4,
        joy: 0.2,
        love: 0.0,
        sadness: 0.0,
        anger: 0.0,
        fear: 0.0
      };

      const wonderIndex = service.calculateWonderIndex(emotions);
      expect(wonderIndex).toBeGreaterThan(0);
      expect(wonderIndex).toBeLessThanOrEqual(1);
      // Average of 0.7, 0.6, 0.5, 0.4 = 0.55
      expect(wonderIndex).toBeCloseTo(0.55, 2);
    });

    it("should return 0 for no wonder emotions", () => {
      const emotions: RawEmotionScores = {
        joy: 0.8,
        love: 0.5,
        sadness: 0.0,
        anger: 0.0,
        fear: 0.0,
        surprise: 0.0
      };

      const wonderIndex = service.calculateWonderIndex(emotions);
      expect(wonderIndex).toBe(0);
    });
  });

  describe("computeDiscoveryLevel", () => {
    it('should return "transcendent" for intensity >= 0.9', () => {
      expect(service.computeDiscoveryLevel(0.95)).toBe("transcendent");
    });

    it('should return "breakthrough" for intensity >= 0.75', () => {
      expect(service.computeDiscoveryLevel(0.8)).toBe("breakthrough");
    });

    it('should return "significant" for intensity >= 0.55', () => {
      expect(service.computeDiscoveryLevel(0.6)).toBe("significant");
    });

    it('should return "normal" for intensity >= 0.35', () => {
      expect(service.computeDiscoveryLevel(0.4)).toBe("normal");
    });

    it('should return "routine" for intensity < 0.35', () => {
      expect(service.computeDiscoveryLevel(0.2)).toBe("routine");
    });
  });

  describe("classifyIntensityLevel", () => {
    it('should return "critical" for intensity >= 0.9', () => {
      expect(service.classifyIntensityLevel(0.95)).toBe("critical");
    });

    it('should return "high" for intensity >= 0.75', () => {
      expect(service.classifyIntensityLevel(0.8)).toBe("high");
    });

    it('should return "moderate" for intensity >= 0.55', () => {
      expect(service.classifyIntensityLevel(0.6)).toBe("moderate");
    });

    it('should return "subtle" for intensity >= 0.35', () => {
      expect(service.classifyIntensityLevel(0.4)).toBe("subtle");
    });

    it('should return "minimal" for intensity < 0.35', () => {
      expect(service.classifyIntensityLevel(0.2)).toBe("minimal");
    });
  });

  describe("enrichEmotionText", () => {
    it("should format really + UPPERCASE for intensity >= 0.9", () => {
      expect(service.enrichEmotionText("joy", 0.95)).toBe("really JOY");
    });

    it("should format pretty + UPPERCASE for intensity >= 0.75", () => {
      expect(service.enrichEmotionText("joy", 0.8)).toBe("pretty JOY");
    });

    it("should format UPPERCASE for intensity >= 0.55", () => {
      expect(service.enrichEmotionText("joy", 0.6)).toBe("JOY");
    });

    it("should format somewhat + lowercase for intensity >= 0.35", () => {
      expect(service.enrichEmotionText("joy", 0.4)).toBe("somewhat joy");
    });

    it("should format slightly + lowercase for intensity < 0.35", () => {
      expect(service.enrichEmotionText("joy", 0.2)).toBe("slightly joy");
    });
  });

  describe("analyzeEmotions (full integration)", () => {
    it("should perform full EQ analysis", () => {
      const raw: RawEmotionScores = {
        joy: 0.78,
        love: 0.12,
        surprise: 0.08,
        curiosity: 0.45,
        sadness: 0.02,
        anger: 0.0,
        fear: 0.0
      };

      const result = service.analyzeEmotions(raw);

      expect(result.category).toBe("joy");
      expect(result.intensity).toBe(0.78);
      expect(result.intensityLevel).toBe("high");
      expect(result.valence).toBeGreaterThan(0); // Positive
      expect(result.arousal).toBeGreaterThan(0.5); // Excited
      expect(result.complexity).toBe("layered"); // joy (0.78) and curiosity (0.45) are > 0.25
      expect(result.wonderIndex).toBeGreaterThan(0); // Has curiosity
      expect(result.discoveryLevel).toBe("breakthrough");
      expect(result.text).toContain("JOY");
      expect(result.raw).toEqual(raw);
    });

    it("should handle complex emotional states", () => {
      const raw: RawEmotionScores = {
        joy: 0.5,
        sadness: 0.4,
        anger: 0.3,
        fear: 0.3,
        love: 0.1,
        surprise: 0.05
      };

      const result = service.analyzeEmotions(raw);

      expect(result.category).toBe("joy");
      expect(result.intensity).toBe(0.5);
      expect(result.complexity).toBe("transcendent"); // 4 emotions > 0.25
      expect(result.valence).toBeLessThan(0.5); // Mixed but more negative
      expect(result.discoveryLevel).toBe("normal");
    });

    it("should handle minimal emotions", () => {
      const raw: RawEmotionScores = {
        joy: 0.2,
        love: 0.1,
        sadness: 0.05,
        anger: 0.0,
        fear: 0.0,
        surprise: 0.0
      };

      const result = service.analyzeEmotions(raw);

      expect(result.category).toBe("joy");
      expect(result.intensity).toBe(0.2);
      expect(result.intensityLevel).toBe("minimal");
      expect(result.complexity).toBe("simple");
      expect(result.discoveryLevel).toBe("routine");
      expect(result.text).toBe("slightly joy");
    });
  });

  // Phase 5.1: Extended Emotions Tests
  describe("Phase 5.1: Extended Emotions", () => {
    describe("calculateMetaEmotionalScore", () => {
      it("should calculate meta-emotional score with breakthrough emotions", () => {
        const emotions: RawEmotionScores = {
          joy: 0.5,
          love: 0.3,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.2,
          breakthrough: 0.8,
          transcendent: 0.7,
          discovery: 0.6
        };

        const metaScore = service.calculateMetaEmotionalScore(emotions);
        expect(metaScore).toBeGreaterThan(0.6);
        expect(metaScore).toBeLessThanOrEqual(1.0);
      });

      it("should return 0 when no meta-emotions present", () => {
        const emotions: RawEmotionScores = {
          joy: 0.8,
          love: 0.6,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.2
        };

        const metaScore = service.calculateMetaEmotionalScore(emotions);
        expect(metaScore).toBe(0);
      });

      it("should handle partial meta-emotional states", () => {
        const emotions: RawEmotionScores = {
          joy: 0.6,
          love: 0.3,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.2,
          flow: 0.5,
          insight: 0.4
        };

        const metaScore = service.calculateMetaEmotionalScore(emotions);
        expect(metaScore).toBeCloseTo(0.45, 1);
      });
    });

    describe("calculatePatternEmotionScore", () => {
      it("should calculate pattern emotion score with growth emotions", () => {
        const emotions: RawEmotionScores = {
          joy: 0.5,
          love: 0.3,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.2,
          growth: 0.7,
          resilience: 0.8,
          transformation: 0.6
        };

        const patternScore = service.calculatePatternEmotionScore(emotions);
        expect(patternScore).toBeGreaterThan(0.6);
        expect(patternScore).toBeLessThanOrEqual(1.0);
      });

      it("should return 0 when no pattern emotions present", () => {
        const emotions: RawEmotionScores = {
          joy: 0.8,
          love: 0.6,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.2
        };

        const patternScore = service.calculatePatternEmotionScore(emotions);
        expect(patternScore).toBe(0);
      });

      it("should handle vulnerability and connection", () => {
        const emotions: RawEmotionScores = {
          joy: 0.4,
          love: 0.3,
          sadness: 0.2,
          anger: 0.0,
          fear: 0.1,
          surprise: 0.0,
          vulnerability: 0.7,
          connection: 0.8
        };

        const patternScore = service.calculatePatternEmotionScore(emotions);
        expect(patternScore).toBeCloseTo(0.75, 1);
      });
    });

    describe("calculateSafetyConcernScore", () => {
      it("should detect high safety concerns", () => {
        const emotions: RawEmotionScores = {
          joy: 0.1,
          love: 0.0,
          sadness: 0.2,
          anger: 0.5,
          fear: 0.3,
          surprise: 0.1,
          hostility: 0.8,
          aggression: 0.7,
          toxicity: 0.6
        };

        const safetyScore = service.calculateSafetyConcernScore(emotions);
        expect(safetyScore).toBeGreaterThan(0.6);
        expect(safetyScore).toBeLessThanOrEqual(1.0);
      });

      it("should return 0 when no safety concerns present", () => {
        const emotions: RawEmotionScores = {
          joy: 0.8,
          love: 0.6,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.2
        };

        const safetyScore = service.calculateSafetyConcernScore(emotions);
        expect(safetyScore).toBe(0);
      });

      it("should handle partial safety concerns", () => {
        const emotions: RawEmotionScores = {
          joy: 0.3,
          love: 0.2,
          sadness: 0.2,
          anger: 0.4,
          fear: 0.2,
          surprise: 0.1,
          aggression: 0.5
        };

        const safetyScore = service.calculateSafetyConcernScore(emotions);
        expect(safetyScore).toBeCloseTo(0.5, 1);
      });
    });

    describe("isBreakthroughMoment", () => {
      it("should detect breakthrough moment", () => {
        const emotions: RawEmotionScores = {
          joy: 0.7,
          love: 0.5,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.3,
          breakthrough: 0.9,
          transcendent: 0.8,
          discovery: 0.7
        };

        expect(service.isBreakthroughMoment(emotions)).toBe(true);
      });

      it("should not detect breakthrough with low meta-emotions", () => {
        const emotions: RawEmotionScores = {
          joy: 0.7,
          love: 0.5,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.3,
          discovery: 0.3
        };

        expect(service.isBreakthroughMoment(emotions)).toBe(false);
      });

      it("should not detect breakthrough without meta-emotions", () => {
        const emotions: RawEmotionScores = {
          joy: 0.9,
          love: 0.8,
          sadness: 0.0,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.5
        };

        expect(service.isBreakthroughMoment(emotions)).toBe(false);
      });
    });

    describe("hasSafetyConcerns", () => {
      it("should flag safety concerns when present", () => {
        const emotions: RawEmotionScores = {
          joy: 0.1,
          love: 0.0,
          sadness: 0.2,
          anger: 0.6,
          fear: 0.4,
          surprise: 0.1,
          hostility: 0.7,
          aggression: 0.6
        };

        expect(service.hasSafetyConcerns(emotions)).toBe(true);
      });

      it("should not flag safety concerns when absent", () => {
        const emotions: RawEmotionScores = {
          joy: 0.8,
          love: 0.6,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.2
        };

        expect(service.hasSafetyConcerns(emotions)).toBe(false);
      });

      it("should not flag safety concerns below threshold", () => {
        const emotions: RawEmotionScores = {
          joy: 0.5,
          love: 0.3,
          sadness: 0.2,
          anger: 0.2,
          fear: 0.1,
          surprise: 0.1,
          hostility: 0.3
        };

        expect(service.hasSafetyConcerns(emotions)).toBe(false);
      });
    });

    describe("Extended emotions in full analysis", () => {
      it("should incorporate extended emotions in valence calculation", () => {
        const emotions: RawEmotionScores = {
          joy: 0.5,
          love: 0.3,
          sadness: 0.2,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.2,
          gratitude: 0.7,
          contentment: 0.6
        };

        const result = service.analyzeEmotions(emotions);
        expect(result.valence).toBeGreaterThan(0.5); // Strong positive
      });

      it("should ignore unrecognized emotions in arousal calculation", () => {
        const emotions: RawEmotionScores = {
          joy: 0.0,
          love: 0.0,
          sadness: 0.6,
          disappointment: 0.4,
          relief: 0.3,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.0,
          calm: 0.8,       // Not a GoEmotions label — ignored
          fatigue: 0.6     // Not a GoEmotions label — ignored
        };

        const result = service.analyzeEmotions(emotions);
        // Only sadness(0.27), disappointment(0.35), relief(0.30) contribute
        expect(result.arousal).toBeLessThan(0.35);
      });

      it("should incorporate extended emotions in wonder index", () => {
        const emotions: RawEmotionScores = {
          joy: 0.5,
          love: 0.3,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.6,
          wonder: 0.8,
          curiosity: 0.7
        };

        const result = service.analyzeEmotions(emotions);
        expect(result.wonderIndex).toBeGreaterThan(0.6);
      });

      it("should handle all emotion categories together", () => {
        const emotions: RawEmotionScores = {
          // Core
          joy: 0.6,
          love: 0.4,
          sadness: 0.1,
          anger: 0.0,
          fear: 0.0,
          surprise: 0.3,
          // Complex
          wonder: 0.5,
          curiosity: 0.6,
          disgust: 0.1,
          // Meta-emotional
          breakthrough: 0.7,
          discovery: 0.6,
          // Pattern
          growth: 0.8,
          resilience: 0.7,
          // Sentiment
          gratitude: 0.5,
          excitement: 0.4,
          // Safety (none)
        };

        const result = service.analyzeEmotions(emotions);
        expect(result.category).toBe("growth"); // Highest score
        expect(result.intensity).toBe(0.8);
        expect(result.valence).toBeGreaterThan(0); // Positive overall
        expect(result.wonderIndex).toBeGreaterThan(0.4); // Has wonder/curiosity/surprise
        expect(result.complexity).toBe("transcendent"); // Many active emotions
      });
    });
  });
});
