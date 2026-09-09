import { TrajectoryService, TimeWindow, PatternType } from "./trajectory.service";
import { MemoryGraduationService } from "./memory-graduation.service";
import { EmotionItemV2 } from "./types.v2";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Logger } from "winston";

/**
 * TrajectoryService Unit Tests
 *
 * Phase 2.1: Comprehensive tests for emotional trajectory tracking
 * Phase 3.2: Updated to include MemoryGraduationService integration
 */
describe("TrajectoryService", () => {
  let service: TrajectoryService;
  let mockDb: jest.Mocked<NodePgDatabase>;
  let mockLogger: jest.Mocked<Logger>;
  let mockGraduationService: jest.Mocked<MemoryGraduationService>;

  beforeEach(() => {
    // Mock database
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockResolvedValue([]),
      returning: jest.fn().mockResolvedValue([{ id: "memory_123" }]),
    } as any;

    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Mock graduation service
    mockGraduationService = {
      calculateSignificance: jest.fn().mockReturnValue(0.75),
      calculateImportance: jest.fn().mockReturnValue(0.60),
    } as any;

    service = new TrajectoryService(mockDb, mockLogger, mockGraduationService);
  });

  describe("storeTrajectoryPoint", () => {
    it("should store trajectory point successfully", async () => {
      const userId = "user_123";
      const contextId = "ctx_456";
      const emotionData: EmotionItemV2 = {
        text: "Test text",
        category: "joy",
        raw: { joy: 0.8, sadness: 0.1, anger: 0, fear: 0, love: 0.1, surprise: 0 },
        intensity: 0.75,
        intensityLevel: "high",
        valence: 0.65,
        arousal: 0.55,
        complexity: "simple",
        wonderIndex: 0.45,
        discoveryLevel: "normal",
      };
      const externalId = "msg_789";
      const metadata = { source: "test", text_preview: "Test preview" };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: "memory_123" }]),
        }),
      } as any);

      const memoryId = await service.storeTrajectoryPoint(userId, emotionData, contextId, externalId, metadata);

      expect(memoryId).toBe("memory_123");
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockGraduationService.calculateSignificance).toHaveBeenCalled();
      expect(mockGraduationService.calculateImportance).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "[TrajectoryService] Stored trajectory point",
        expect.objectContaining({
          userId,
          memoryId: "memory_123",
          emotion: "joy",
          intensity: 0.75,
          significanceScore: "0.75",
          importanceScore: "0.60",
        })
      );
    });

    it("should handle storage errors gracefully", async () => {
      const userId = "user_123";
      const emotionData: EmotionItemV2 = {
        text: "Test",
        category: "joy",
        raw: { joy: 0.8, sadness: 0, anger: 0, fear: 0, love: 0, surprise: 0 },
        intensity: 0.75,
        intensityLevel: "high",
        valence: 0.65,
        arousal: 0.55,
        complexity: "simple",
        wonderIndex: 0.45,
        discoveryLevel: "normal",
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockRejectedValue(new Error("Database error")),
        }),
      } as any);

      await expect(
        service.storeTrajectoryPoint(userId, emotionData)
      ).rejects.toThrow("Failed to store emotional trajectory point");

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("calculateBaseline", () => {
    it("should calculate baseline with sufficient data", async () => {
      const userId = "user_123";
      const mockTrajectoryData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.80",
          valence: "0.70",
          arousal: "0.60",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.40",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.60",
          valence: "-0.40",
          arousal: "0.30",
          wonderIndex: "0.20",
          complexity: "layered",
          discoveryLevel: "significant",
          timestamp: new Date(),
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.85",
          valence: "0.75",
          arousal: "0.65",
          wonderIndex: "0.90",
          complexity: "simple",
          discoveryLevel: "breakthrough",
          timestamp: new Date(),
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockTrajectoryData),
      } as any);

      const baseline = await service.calculateBaseline(userId, TimeWindow.MONTH);

      expect(baseline).toBeDefined();
      expect(baseline?.userId).toBe(userId);
      expect(baseline?.dataPointCount).toBe(4);
      expect(baseline?.dominantEmotions.joy).toBeCloseTo(0.75); // 3 out of 4
      expect(baseline?.dominantEmotions.sadness).toBeCloseTo(0.25); // 1 out of 4
      expect(baseline?.averageIntensity).toBeCloseTo(0.7375); // (0.8+0.7+0.6+0.85)/4
      expect(baseline?.breakthroughCount).toBe(1);
      expect(baseline?.averageComplexity).toBe("simple"); // most common
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "[TrajectoryService] Calculated baseline",
        expect.objectContaining({ userId })
      );
    });

    it("should return null when no data available", async () => {
      const userId = "user_new";

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([]),
      } as any);

      const baseline = await service.calculateBaseline(userId, TimeWindow.WEEK);

      expect(baseline).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "[TrajectoryService] No trajectory data found",
        expect.objectContaining({ userId })
      );
    });

    it("should calculate volatility correctly", async () => {
      const userId = "user_123";
      const mockTrajectoryData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.50",
          valence: "0.50",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.50",
          valence: "0.50",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockTrajectoryData),
      } as any);

      const baseline = await service.calculateBaseline(userId, TimeWindow.MONTH);

      expect(baseline?.emotionalVolatility).toBe(0); // No variance
    });

    it("should handle different time windows", async () => {
      const userId = "user_123";
      const mockData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.40",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockData),
      } as any);

      // Test WEEK window
      const weekBaseline = await service.calculateBaseline(userId, TimeWindow.WEEK);
      expect(weekBaseline?.window).toBe(TimeWindow.WEEK);

      // Test QUARTER window
      const quarterBaseline = await service.calculateBaseline(userId, TimeWindow.QUARTER);
      expect(quarterBaseline?.window).toBe(TimeWindow.QUARTER);
    });
  });

  describe("analyzeTrend", () => {
    it("should detect improving trend", async () => {
      const userId = "user_123";

      // First half: lower valence and wonder
      const firstHalfData = [
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.50",
          valence: "0.20",
          arousal: "0.30",
          wonderIndex: "0.30",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        },
      ];

      // Second half: higher valence and wonder
      const secondHalfData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.80",
          arousal: "0.60",
          wonderIndex: "0.70",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
      ];

      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(firstHalfData),
        } as any)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(secondHalfData),
        } as any);

      const trend = await service.analyzeTrend(userId, TimeWindow.MONTH);

      expect(trend).toBeDefined();
      expect(trend?.direction).toBe("improving");
      expect(trend?.valenceTrend).toBeGreaterThan(0);
      expect(trend?.wonderTrend).toBeGreaterThan(0);
    });

    it("should detect declining trend", async () => {
      const userId = "user_123";

      // First half: high valence and wonder
      const firstHalfData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.80",
          valence: "0.80",
          arousal: "0.70",
          wonderIndex: "0.80",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        },
      ];

      // Second half: lower valence and wonder
      const secondHalfData = [
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.50",
          valence: "0.20",
          arousal: "0.30",
          wonderIndex: "0.20",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
      ];

      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(firstHalfData),
        } as any)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(secondHalfData),
        } as any);

      const trend = await service.analyzeTrend(userId, TimeWindow.MONTH);

      expect(trend).toBeDefined();
      expect(trend?.direction).toBe("declining");
      expect(trend?.valenceTrend).toBeLessThan(0);
      expect(trend?.wonderTrend).toBeLessThan(0);
    });

    it("should detect stable trend", async () => {
      const userId = "user_123";

      const stableData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.60",
          valence: "0.50",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
      ];

      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(stableData),
        } as any)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(stableData),
        } as any);

      const trend = await service.analyzeTrend(userId, TimeWindow.MONTH);

      expect(trend).toBeDefined();
      expect(trend?.direction).toBe("stable");
      expect(Math.abs(trend?.valenceTrend || 0)).toBeLessThan(0.01);
    });

    it("should calculate breakthrough rate correctly", async () => {
      const userId = "user_123";

      const firstHalfData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.60",
          valence: "0.50",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
      ];

      const secondHalfData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.90",
          valence: "0.80",
          arousal: "0.70",
          wonderIndex: "0.95",
          complexity: "transcendent",
          discoveryLevel: "breakthrough",
          timestamp: new Date(),
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.85",
          valence: "0.75",
          arousal: "0.65",
          wonderIndex: "0.90",
          complexity: "paradoxical",
          discoveryLevel: "transcendent",
          timestamp: new Date(),
        },
      ];

      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(firstHalfData),
        } as any)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(secondHalfData),
        } as any);

      const trend = await service.analyzeTrend(userId, TimeWindow.MONTH);

      expect(trend).toBeDefined();
      expect(trend?.breakthroughRate).toBeGreaterThan(0);
    });

    it("should return null when insufficient data", async () => {
      const userId = "user_new";

      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([]),
        } as any)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue([]),
        } as any);

      const trend = await service.analyzeTrend(userId, TimeWindow.MONTH);

      expect(trend).toBeNull();
    });
  });

  describe("detectBreakthrough", () => {
    it("should detect breakthrough by discovery level", () => {
      const emotionData: EmotionItemV2 = {
        text: "Amazing discovery!",
        category: "joy",
        raw: { joy: 0.95, sadness: 0, anger: 0, fear: 0, love: 0.05, surprise: 0 },
        intensity: 0.85,
        intensityLevel: "critical",
        valence: 0.90,
        arousal: 0.80,
        complexity: "transcendent",
        wonderIndex: 0.95,
        discoveryLevel: "breakthrough",
      };

      const result = service.detectBreakthrough(emotionData, null);

      expect(result.detected).toBe(true);
      expect(result.type).toBe("discovery_level");
      expect(result.significance).toBe(0.85);
    });

    it("should detect breakthrough by transcendent discovery level", () => {
      const emotionData: EmotionItemV2 = {
        text: "Transcendent moment",
        category: "joy",
        raw: { joy: 0.98, sadness: 0, anger: 0, fear: 0, love: 0.02, surprise: 0 },
        intensity: 0.95,
        intensityLevel: "critical",
        valence: 0.95,
        arousal: 0.90,
        complexity: "transcendent",
        wonderIndex: 0.98,
        discoveryLevel: "transcendent",
      };

      const result = service.detectBreakthrough(emotionData, null);

      expect(result.detected).toBe(true);
      expect(result.type).toBe("discovery_level");
    });

    it("should detect intensity spike above baseline", () => {
      const emotionData: EmotionItemV2 = {
        text: "High intensity",
        category: "joy",
        raw: { joy: 0.95, sadness: 0, anger: 0, fear: 0, love: 0, surprise: 0 },
        intensity: 0.95,
        intensityLevel: "critical",
        valence: 0.85,
        arousal: 0.75,
        complexity: "simple",
        wonderIndex: 0.50,
        discoveryLevel: "normal",
      };

      const baseline = {
        userId: "user_123",
        window: TimeWindow.MONTH,
        periodStart: new Date(),
        periodEnd: new Date(),
        dataPointCount: 10,
        dominantEmotions: { joy: 0.7, sadness: 0.3 },
        averageIntensity: 0.55, // Current is 0.95, difference is 0.40 > 0.35 threshold
        baselineValence: 0.50,
        baselineArousal: 0.50,
        emotionalVolatility: 0.15,
        averageComplexity: "simple",
        averageWonderIndex: 0.40,
        breakthroughCount: 0,
      };

      const result = service.detectBreakthrough(emotionData, baseline);

      expect(result.detected).toBe(true);
      expect(result.type).toBe("intensity_spike");
      expect(result.significance).toBeCloseTo(0.40);
    });

    it("should detect wonder explosion", () => {
      const emotionData: EmotionItemV2 = {
        text: "Mind-blowing realization",
        category: "surprise",
        raw: { joy: 0.5, sadness: 0, anger: 0, fear: 0, love: 0, surprise: 0.5 },
        intensity: 0.75,
        intensityLevel: "high",
        valence: 0.80,
        arousal: 0.85,
        complexity: "layered",
        wonderIndex: 0.95, // >= 0.9 threshold
        discoveryLevel: "significant",
      };

      const baseline = {
        userId: "user_123",
        window: TimeWindow.MONTH,
        periodStart: new Date(),
        periodEnd: new Date(),
        dataPointCount: 10,
        dominantEmotions: { joy: 0.7, sadness: 0.3 },
        averageIntensity: 0.70,
        baselineValence: 0.50,
        baselineArousal: 0.50,
        emotionalVolatility: 0.15,
        averageComplexity: "simple",
        averageWonderIndex: 0.40,
        breakthroughCount: 0,
      };

      const result = service.detectBreakthrough(emotionData, baseline);

      expect(result.detected).toBe(true);
      expect(result.type).toBe("wonder_explosion");
      expect(result.significance).toBe(0.95);
    });

    it("should not detect breakthrough for normal emotions", () => {
      const emotionData: EmotionItemV2 = {
        text: "Regular day",
        category: "joy",
        raw: { joy: 0.6, sadness: 0.1, anger: 0, fear: 0, love: 0.3, surprise: 0 },
        intensity: 0.55,
        intensityLevel: "moderate",
        valence: 0.50,
        arousal: 0.45,
        complexity: "simple",
        wonderIndex: 0.40,
        discoveryLevel: "normal",
      };

      const baseline = {
        userId: "user_123",
        window: TimeWindow.MONTH,
        periodStart: new Date(),
        periodEnd: new Date(),
        dataPointCount: 10,
        dominantEmotions: { joy: 0.7, sadness: 0.3 },
        averageIntensity: 0.55,
        baselineValence: 0.50,
        baselineArousal: 0.50,
        emotionalVolatility: 0.15,
        averageComplexity: "simple",
        averageWonderIndex: 0.40,
        breakthroughCount: 0,
      };

      const result = service.detectBreakthrough(emotionData, baseline);

      expect(result.detected).toBe(false);
      expect(result.type).toBeUndefined();
      expect(result.significance).toBeUndefined();
    });

    it("should handle null baseline for non-discovery-level breakthroughs", () => {
      const emotionData: EmotionItemV2 = {
        text: "Normal emotion",
        category: "joy",
        raw: { joy: 0.6, sadness: 0, anger: 0, fear: 0, love: 0, surprise: 0 },
        intensity: 0.95,
        intensityLevel: "critical",
        valence: 0.80,
        arousal: 0.70,
        complexity: "simple",
        wonderIndex: 0.50,
        discoveryLevel: "normal",
      };

      const result = service.detectBreakthrough(emotionData, null);

      expect(result.detected).toBe(false);
    });
  });

  describe("getRecentTrajectory", () => {
    it("should retrieve recent trajectory points", async () => {
      const userId = "user_123";
      const mockData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.80",
          valence: "0.70",
          arousal: "0.60",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockData),
      } as any);

      const result = await service.getRecentTrajectory(userId, 10);

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(userId);
      expect(result[0].dominantEmotion).toBe("joy");
    });

    it("should use default limit when not specified", async () => {
      const userId = "user_123";

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      } as any);

      await service.getRecentTrajectory(userId);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      const userId = "user_123";

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockRejectedValue(new Error("Database error")),
      } as any);

      await expect(service.getRecentTrajectory(userId)).rejects.toThrow(
        "Failed to retrieve trajectory data"
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty emotion data", async () => {
      const userId = "user_123";
      const emotionData: EmotionItemV2 = {
        text: "",
        category: "neutral",
        raw: { joy: 0, sadness: 0, anger: 0, fear: 0, love: 0, surprise: 0 },
        intensity: 0,
        intensityLevel: "minimal",
        valence: 0,
        arousal: 0,
        complexity: "simple",
        wonderIndex: 0,
        discoveryLevel: "routine",
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: "memory_empty" }]),
        }),
      } as any);

      const memoryId = await service.storeTrajectoryPoint(userId, emotionData);
      expect(memoryId).toBe("memory_empty");
      expect(mockGraduationService.calculateSignificance).toHaveBeenCalled();
      expect(mockGraduationService.calculateImportance).toHaveBeenCalled();
    });

    it("should handle baseline calculation errors", async () => {
      const userId = "user_123";

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockRejectedValue(new Error("Database error")),
      } as any);

      await expect(service.calculateBaseline(userId)).rejects.toThrow(
        "Failed to calculate emotional baseline"
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("should handle trend analysis errors", async () => {
      const userId = "user_123";

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockRejectedValue(new Error("Database error")),
      } as any);

      await expect(service.analyzeTrend(userId)).rejects.toThrow(
        "Failed to analyze emotional trend"
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
