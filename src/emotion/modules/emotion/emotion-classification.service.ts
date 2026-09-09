import axios from "axios";
import { snakeToCamelObject } from "@shared/utils";
import type { AxiosInstance } from "axios";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { EmotionApiResponse, EmotionBatchResponse } from "./types";

enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

const CIRCUIT_FAILURE_THRESHOLD = 15;
const CIRCUIT_RESET_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_FALLBACKS_WARN = 50;

@autoInjectable()
export class EmotionClassificationService {
  private client: AxiosInstance;

  private circuitState: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenAttempts: number = 0;

  // Fallback metrics
  private totalRequests: number = 0;
  private fallbackCount: number = 0;
  private consecutiveFallbacks: number = 0;
  private lastRealClassificationAt: number = 0;

  constructor(@inject("LOGGER") private logger: Logger) {
    this.client = axios.create({
      baseURL: process.env.EMOTION_CLASSIFICATION_URL || "http://127.0.0.1:8080",
      timeout: 5000,
    });
  }

  async classify(text: string): Promise<EmotionApiResponse> {
    this.totalRequests++;

    if (this.shouldReturnFallback()) {
      this.logger.warn("Circuit OPEN - returning fallback emotion response");
      return this.trackFallback();
    }

    try {
      const res = await this.withRetry(() =>
        this.client.post<EmotionApiResponse>("/v1/predict", { text })
      );
      this.onSuccess();
      this.lastRealClassificationAt = Date.now();
      this.consecutiveFallbacks = 0;
      return snakeToCamelObject(res.data);
    } catch (error) {
      this.onFailure(error);
      this.logger.warn("Emotion classification failed after retries, returning fallback", {
        error: (error as Error).message,
        circuitState: this.circuitState,
        consecutiveFailures: this.consecutiveFailures,
      });
      return this.trackFallback();
    }
  }

  async batchClassify(texts: string[]): Promise<EmotionBatchResponse> {
    this.totalRequests++;

    if (this.shouldReturnFallback()) {
      this.logger.warn("Circuit OPEN - returning fallback batch emotion response");
      this.fallbackCount++;
      this.consecutiveFallbacks++;
      return this.getFallbackBatchResponse(texts.length);
    }

    try {
      const res = await this.withRetry(() =>
        this.client.post<EmotionBatchResponse>("/v1/batch-predict", { texts })
      );
      this.onSuccess();
      this.lastRealClassificationAt = Date.now();
      this.consecutiveFallbacks = 0;
      return snakeToCamelObject(res.data);
    } catch (error) {
      this.onFailure(error);
      this.logger.warn("Batch emotion classification failed after retries, returning fallback", {
        error: (error as Error).message,
        batchSize: texts.length,
        circuitState: this.circuitState,
        consecutiveFailures: this.consecutiveFailures,
      });
      this.fallbackCount++;
      this.consecutiveFallbacks++;
      return this.getFallbackBatchResponse(texts.length);
    }
  }

  getCircuitState() {
    return {
      state: this.circuitState,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      totalRequests: this.totalRequests,
      fallbackCount: this.fallbackCount,
      fallbackRate: this.totalRequests > 0 ? this.fallbackCount / this.totalRequests : 0,
      consecutiveFallbacks: this.consecutiveFallbacks,
      lastRealClassificationAt: this.lastRealClassificationAt || null,
    };
  }

  private trackFallback(): EmotionApiResponse {
    this.fallbackCount++;
    this.consecutiveFallbacks++;
    if (this.consecutiveFallbacks === MAX_CONSECUTIVE_FALLBACKS_WARN) {
      this.logger.error(
        `ALERT: ${MAX_CONSECUTIVE_FALLBACKS_WARN} consecutive fallback responses — ML classifier may be permanently down`,
        { circuitState: this.circuitState, fallbackRate: this.fallbackCount / this.totalRequests },
      );
    }
    return this.getFallbackResponse();
  }

  enrichEmotion(category: string, value: number): string {
    if (value >= 0.75) {
      return `Highly ${category.toUpperCase()}`;
    } else if (value >= 0.5) {
      return `Moderately ${category.toUpperCase()}`;
    } else {
      return `Slightly ${category.toUpperCase()}`;
    }
  }

  private shouldReturnFallback(): boolean {
    if (this.circuitState === CircuitState.CLOSED) return false;

    if (this.circuitState === CircuitState.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      // Exponential backoff: 30s, 60s, 120s, 240s (capped)
      const backoff = Math.min(CIRCUIT_RESET_TIMEOUT_MS * Math.pow(2, this.halfOpenAttempts), 240_000);
      if (elapsed >= backoff) {
        this.circuitState = CircuitState.HALF_OPEN;
        this.logger.info(`Circuit transitioning to HALF_OPEN - probe attempt ${this.halfOpenAttempts + 1} (backoff ${backoff}ms)`);
        return false;
      }
      return true;
    }

    // HALF_OPEN: allow the request through
    return false;
  }

  private onSuccess(): void {
    if (this.circuitState !== CircuitState.CLOSED) {
      this.logger.info(`Circuit closing - ML service recovered (was ${this.circuitState})`);
    }
    this.consecutiveFailures = 0;
    this.halfOpenAttempts = 0;
    this.circuitState = CircuitState.CLOSED;
  }

  private onFailure(error: unknown): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && this.circuitState !== CircuitState.OPEN) {
      this.circuitState = CircuitState.OPEN;
      this.logger.error(`Circuit OPEN after ${this.consecutiveFailures} consecutive failures`, {
        error: (error as Error).message,
      });
    } else if (this.circuitState === CircuitState.HALF_OPEN) {
      this.circuitState = CircuitState.OPEN;
      this.halfOpenAttempts++;
      this.logger.warn(`Circuit re-opened - HALF_OPEN probe ${this.halfOpenAttempts} failed`);
    }
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.debug(`Emotion classification retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  private getFallbackResponse(): EmotionApiResponse {
    return {
      results: { joy: 0, sadness: 0, anger: 0, fear: 0, surprise: 0, love: 0 },
      activeLabels: [],
      modelType: "single",
      processingTime: 0,
      tokenInput: 0,
      tokenUsage: 0,
      isFallback: true,
      fallbackReason: "ml_classifier_unavailable",
    };
  }

  private getFallbackBatchResponse(count: number): EmotionBatchResponse {
    const fallback = this.getFallbackResponse();
    return {
      batches: Array.from({ length: count }, () => ({
        results: fallback.results,
        activeLabels: [],
        processingTime: 0,
        tokenInput: 0,
        tokenUsage: 0,
        isFallback: true,
      })),
      totalProcessingTime: 0,
      totalTokenInput: 0,
      totalTokenUsage: 0,
    };
  }
}
