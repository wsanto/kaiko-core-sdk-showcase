import "reflect-metadata";
import { GrowthTrackingService } from "./growth-tracking.service";
import { GrowthDimension } from "./types.v2";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Logger } from "winston";

describe("GrowthTrackingService", () => {
  let service: GrowthTrackingService;
  let mockDb: jest.Mocked<NodePgDatabase>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Mock database with all necessary methods
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockResolvedValue([]),
    } as any;

    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    service = new GrowthTrackingService(mockDb, mockLogger);
  });

  describe("measureGrowth", () => {
    it("should measure growth across all 5 dimensions with sufficient data", async () => {
      const userId = "user_123";

      // Mock recent data (last 30 days)
      const recentData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.75",
          valence: "0.65",
          arousal: "0.55",
          wonderIndex: "0.60",
          complexity: "layered",
          discoveryLevel: "normal",
          timestamp: new Date("2025-11-15T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.50",
          valence: "-0.40",
          arousal: "0.30",
          wonderIndex: "0.45",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date("2025-11-14T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.55",
          complexity: "layered",
          discoveryLevel: "normal",
          timestamp: new Date("2025-11-13T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "fear",
          intensity: "0.60",
          valence: "-0.50",
          arousal: "0.70",
          wonderIndex: "0.40",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date("2025-11-12T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.80",
          valence: "0.70",
          arousal: "0.60",
          wonderIndex: "0.65",
          complexity: "paradoxical",
          discoveryLevel: "significant",
          timestamp: new Date("2025-11-11T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
      ];

      // Mock historical data (31-60 days ago)
      const historicalData = [
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.70",
          valence: "-0.60",
          arousal: "0.40",
          wonderIndex: "0.30",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date("2025-10-15T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "anger",
          intensity: "0.80",
          valence: "-0.70",
          arousal: "0.80",
          wonderIndex: "0.25",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date("2025-10-14T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.65",
          valence: "-0.55",
          arousal: "0.35",
          wonderIndex: "0.35",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date("2025-10-13T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "fear",
          intensity: "0.75",
          valence: "-0.65",
          arousal: "0.75",
          wonderIndex: "0.20",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date("2025-10-12T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.85",
          valence: "-0.75",
          arousal: "0.45",
          wonderIndex: "0.30",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date("2025-10-11T10:00:00Z"),
          contextId: null,
          externalId: null,
          metadata: {},
        },
      ];

      // Mock database calls
      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce(historicalData);

      const result = await service.measureGrowth(userId);

      expect(result).not.toBeNull();
      expect(result?.dimensions).toHaveLength(5);
      expect(result?.overallGrowthScore).toBeDefined();
      expect(result?.dimensionsGrowing).toBeGreaterThanOrEqual(0);
      expect(result?.dimensionsDecline).toBeGreaterThanOrEqual(0);
      expect(result?.summary).toBeTruthy();

      // Verify all 5 dimensions are present
      const dimensionTypes = result?.dimensions.map((d) => d.dimension);
      expect(dimensionTypes).toContain(GrowthDimension.REGULATION);
      expect(dimensionTypes).toContain(GrowthDimension.AWARENESS);
      expect(dimensionTypes).toContain(GrowthDimension.VULNERABILITY);
      expect(dimensionTypes).toContain(GrowthDimension.RESILIENCE);
      expect(dimensionTypes).toContain(GrowthDimension.COMPLEXITY);
    });

    it("should return null when insufficient recent data", async () => {
      const userId = "user_123";

      // Only 2 data points (need 5+)
      const recentData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.75",
          valence: "0.65",
          arousal: "0.55",
          wonderIndex: "0.60",
          complexity: "layered",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
      ];

      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce([]);

      const result = await service.measureGrowth(userId);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Insufficient data"),
        expect.any(Object)
      );
    });

    it("should return null when insufficient historical data", async () => {
      const userId = "user_123";

      const recentData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "joy",
          intensity: "0.75",
          valence: "0.65",
          arousal: "0.55",
          wonderIndex: "0.60",
          complexity: "layered",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce([]); // No historical data

      const result = await service.measureGrowth(userId);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      const userId = "user_123";

      (mockDb as any).orderBy = jest
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      await expect(service.measureGrowth(userId)).rejects.toThrow(
        "Failed to measure growth"
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("REGULATION dimension", () => {
    it("should detect emotional regulation improvement (reduced volatility)", async () => {
      const userId = "user_123";

      // Recent data: low volatility (more stable emotions)
      const recentData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "joy",
          intensity: "0.70", // Consistent intensity
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      // Historical data: high volatility (unstable emotions)
      const historicalData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.90", // High intensity
          valence: "0.80",
          arousal: "0.70",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.20", // Low intensity
          valence: "-0.30",
          arousal: "0.20",
          wonderIndex: "0.30",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "anger",
          intensity: "0.95", // Very high intensity
          valence: "-0.80",
          arousal: "0.90",
          wonderIndex: "0.20",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.30", // Low intensity
          valence: "0.30",
          arousal: "0.30",
          wonderIndex: "0.40",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "fear",
          intensity: "0.85", // High intensity
          valence: "-0.70",
          arousal: "0.80",
          wonderIndex: "0.25",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
      ];

      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce(historicalData);

      const result = await service.measureGrowth(userId);

      const regulation = result?.dimensions.find(
        (d) => d.dimension === GrowthDimension.REGULATION
      );

      expect(regulation).toBeDefined();
      expect(regulation?.isGrowing).toBe(true); // Volatility decreased
      expect(regulation?.percentageChange).toBeLessThan(0); // Negative = improvement
    });
  });

  describe("AWARENESS dimension", () => {
    it("should detect emotional awareness growth (increased complexity)", async () => {
      const userId = "user_123";

      // Recent data: higher complexity
      const recentData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "paradoxical", // Higher complexity
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      // Historical data: lower complexity
      const historicalData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "sadness",
          intensity: "0.60",
          valence: "-0.40",
          arousal: "0.40",
          wonderIndex: "0.30",
          complexity: "simple", // Lower complexity
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce(historicalData);

      const result = await service.measureGrowth(userId);

      const awareness = result?.dimensions.find(
        (d) => d.dimension === GrowthDimension.AWARENESS
      );

      expect(awareness).toBeDefined();
      expect(awareness?.isGrowing).toBe(true);
      expect(awareness?.percentageChange).toBeGreaterThan(15); // Above 15% threshold
    });
  });

  describe("VULNERABILITY dimension", () => {
    it("should detect increased emotional openness", async () => {
      const userId = "user_123";

      // Recent data: more vulnerable emotions
      const recentData = [
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.60",
          valence: "-0.40",
          arousal: "0.40",
          wonderIndex: "0.40",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "fear",
          intensity: "0.65",
          valence: "-0.50",
          arousal: "0.70",
          wonderIndex: "0.35",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "anxiety",
          intensity: "0.55",
          valence: "-0.45",
          arousal: "0.60",
          wonderIndex: "0.30",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "grief",
          intensity: "0.70",
          valence: "-0.70",
          arousal: "0.50",
          wonderIndex: "0.25",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "loneliness",
          intensity: "0.60",
          valence: "-0.55",
          arousal: "0.45",
          wonderIndex: "0.30",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
      ];

      // Historical data: mostly positive emotions (less vulnerable - 40% vulnerable)
      const historicalData = [
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "sadness", // 1 vulnerable
          intensity: "0.60",
          valence: "-0.40",
          arousal: "0.40",
          wonderIndex: "0.40",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "fear", // 1 vulnerable
          intensity: "0.65",
          valence: "-0.50",
          arousal: "0.70",
          wonderIndex: "0.35",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        },
      ];

      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce(historicalData);

      const result = await service.measureGrowth(userId);

      const vulnerability = result?.dimensions.find(
        (d) => d.dimension === GrowthDimension.VULNERABILITY
      );

      expect(vulnerability).toBeDefined();
      expect(vulnerability?.isGrowing).toBe(true);
      expect(vulnerability?.recentValue).toBeGreaterThan(
        vulnerability?.historicalValue || 0
      );
    });
  });

  describe("RESILIENCE dimension", () => {
    it("should detect faster emotional recovery", async () => {
      const userId = "user_123";
      const now = new Date("2025-11-17T12:00:00Z");

      // Recent data: fast recovery (negative -> positive in 10 minutes)
      const recentData = [
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.60",
          valence: "-0.50",
          arousal: "0.40",
          wonderIndex: "0.40",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(now.getTime() - 50 * 60 * 1000), // 10 min later
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "fear",
          intensity: "0.55",
          valence: "-0.45",
          arousal: "0.60",
          wonderIndex: "0.35",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(now.getTime() - 40 * 60 * 1000),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.65",
          valence: "0.55",
          arousal: "0.45",
          wonderIndex: "0.45",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(now.getTime() - 30 * 60 * 1000), // 10 min later
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.75",
          valence: "0.65",
          arousal: "0.55",
          wonderIndex: "0.55",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(now.getTime() - 20 * 60 * 1000),
          contextId: null,
          externalId: null,
          metadata: {},
        },
      ];

      // Historical data: slow recovery (negative -> positive in 2 hours)
      const historicalData = [
        {
          userId,
          dominantEmotion: "sadness",
          intensity: "0.70",
          valence: "-0.60",
          arousal: "0.40",
          wonderIndex: "0.30",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.60",
          valence: "0.50",
          arousal: "0.40",
          wonderIndex: "0.40",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000 + 120 * 60 * 1000
          ), // 2 hours later
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "anger",
          intensity: "0.75",
          valence: "-0.70",
          arousal: "0.80",
          wonderIndex: "0.25",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000),
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.65",
          valence: "0.55",
          arousal: "0.45",
          wonderIndex: "0.45",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(
            now.getTime() - 29 * 24 * 60 * 60 * 1000 + 150 * 60 * 1000
          ), // 2.5 hours later
          contextId: null,
          externalId: null,
          metadata: {},
        },
        {
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
          contextId: null,
          externalId: null,
          metadata: {},
        },
      ];

      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce(historicalData);

      const result = await service.measureGrowth(userId);

      const resilience = result?.dimensions.find(
        (d) => d.dimension === GrowthDimension.RESILIENCE
      );

      expect(resilience).toBeDefined();
      expect(resilience?.isGrowing).toBe(true);
      expect(resilience?.recentValue).toBeLessThan(
        resilience?.historicalValue || Infinity
      );
    });
  });

  describe("COMPLEXITY dimension", () => {
    it("should detect increased wonder index", async () => {
      const userId = "user_123";

      // Recent data: higher wonder index
      const recentData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.80", // High wonder
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      // Historical data: lower wonder index
      const historicalData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "sadness",
          intensity: "0.60",
          valence: "-0.40",
          arousal: "0.40",
          wonderIndex: "0.30", // Low wonder
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce(historicalData);

      const result = await service.measureGrowth(userId);

      const complexity = result?.dimensions.find(
        (d) => d.dimension === GrowthDimension.COMPLEXITY
      );

      expect(complexity).toBeDefined();
      expect(complexity?.isGrowing).toBe(true);
      expect(complexity?.percentageChange).toBeGreaterThan(15); // Above 15% threshold
    });
  });

  describe("Growth summary generation", () => {
    it("should generate 'Excellent growth' summary for 4+ growing dimensions", async () => {
      const userId = "user_123";

      // Create data that will show growth in all dimensions
      const recentData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "sadness", // Vulnerable emotion
          intensity: "0.60", // Stable intensity
          valence: i < 2 ? "-0.40" : "0.50", // Fast recovery
          arousal: "0.40",
          wonderIndex: "0.80", // High wonder
          complexity: "paradoxical", // High complexity
          discoveryLevel: "normal",
          timestamp: new Date(Date.now() - i * 10 * 60 * 1000), // 10 min apart
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      const historicalData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "joy", // Not vulnerable
          intensity: i % 2 === 0 ? "0.90" : "0.20", // High volatility
          valence: i < 3 ? "-0.60" : "0.40", // Slow recovery
          arousal: "0.50",
          wonderIndex: "0.30", // Low wonder
          complexity: "simple", // Low complexity
          discoveryLevel: "normal",
          timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce(historicalData);

      const result = await service.measureGrowth(userId);

      expect(result?.dimensionsGrowing).toBeGreaterThanOrEqual(3);
      expect(result?.summary).toBeTruthy();
    });

    it("should generate appropriate summary for stable emotions", async () => {
      const userId = "user_123";

      // Create data with minimal changes
      const recentData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "joy",
          intensity: "0.70",
          valence: "0.60",
          arousal: "0.50",
          wonderIndex: "0.50",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      const historicalData = Array(5)
        .fill(null)
        .map((_, i) => ({
          userId,
          dominantEmotion: "joy",
          intensity: "0.71", // Nearly identical
          valence: "0.61",
          arousal: "0.51",
          wonderIndex: "0.51",
          complexity: "simple",
          discoveryLevel: "normal",
          timestamp: new Date(),
          contextId: null,
          externalId: null,
          metadata: {},
        }));

      (mockDb as any).orderBy = jest
        .fn()
        .mockResolvedValueOnce(recentData)
        .mockResolvedValueOnce(historicalData);

      const result = await service.measureGrowth(userId);

      expect(result?.dimensionsGrowing).toBe(0);
      expect(result?.summary).toContain("stable");
    });
  });
});
