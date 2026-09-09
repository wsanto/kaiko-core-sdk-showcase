import { UsageLogHelpers } from "@shared/helpers/usage_log";
import { QueuePublisher } from "@shared/services/sqs.publisher";
import { UsageLogPayloadBody } from "@shared/types/usage_log.payload";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { EmotionClassificationService } from "../emotion/emotion-classification.service";
import { EQAnalysisService } from "../emotion/eq-analysis.service";
import { LLMService } from "../llm/services/llm.service";
import { ChatCompletionBody } from "./types";
import { ChatCompletionResponseV2 } from "../emotion/types.v2";

// Request context for usage logging
export interface RequestContext {
  userId: string;
  apiKeyId: string;
  requestId: string;
  projectId: string;
  apiPath: string;
}

/**
 * Chat Service V2
 *
 * Enhanced chat completion service with multi-dimensional EQ analysis.
 * Uses EQAnalysisService to add 6 new EQ dimensions to emotion responses in chat completions.
 */
@autoInjectable()
export default class ChatServiceV2 extends UsageLogHelpers {
  constructor(
    @inject("DB") private database: NodePgDatabase,
    @inject("LOGGER") private logger: Logger,
    @inject(EmotionClassificationService)
    private emotionService: EmotionClassificationService,
    @inject("LLMService") private llmService: LLMService,
    @inject(EQAnalysisService)
    private eqAnalysis: EQAnalysisService,
    @inject("UsageLogQueue") private usageQueue?: QueuePublisher<UsageLogPayloadBody>
  ) {
    super();
  }

  // V2: POST /v2/chat/completions
  async handleChatCompletionV2(body: ChatCompletionBody, requestContext: RequestContext): Promise<ChatCompletionResponseV2> {
    try {
      this.logger.debug("[ChatServiceV2] handleChatCompletionV2 called", {
        model: body.model,
        contextId: body.contextId,
        messageCount: body.messages.length,
        userId: requestContext.userId,
      });

      const userMessage =
        body.messages.find((m) => m.role === "user")?.content ?? "";
      const emotionData = await this.emotionService.classify(userMessage);

      const llmResponse = await this.llmService.generate(userMessage, {
        model: body.model,
      });
      const llmResponseContent = llmResponse.content;

      // Use EQ analysis to enhance the emotion data
      const chatMlDims = (emotionData.dimensionalPredictions?.valence != null) ? emotionData.dimensionalPredictions : undefined;
      const emotionItemV2 = this.eqAnalysis.analyzeEmotions(emotionData.results, chatMlDims);

      const result: ChatCompletionResponseV2 = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion" as const,
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant" as const,
              content: llmResponseContent,
            },
            finish_reason: "stop" as const,
          },
        ],
        emotions: { user: emotionItemV2 }, // Enhanced V2 emotion with EQ dimensions
        usage: {
          prompt_tokens: emotionData.tokenInput || 25,
          completion_tokens: Math.ceil(llmResponseContent.length / 4),
          total_tokens:
            (emotionData.tokenInput || 25) +
            Math.ceil(llmResponseContent.length / 4),
        },
      };

      this.logger.info("[ChatServiceV2] handleChatCompletionV2 success", {
        contextId: body.contextId,
        responseLength: llmResponseContent.length,
        totalTokens: result.usage.total_tokens,
        intensity: emotionItemV2.intensity,
        valence: emotionItemV2.valence,
        complexity: emotionItemV2.complexity,
      });

      // Log usage for billing
      const usageLogs: UsageLogPayloadBody[] = [
        this.buildRequestLogs({
          requestId: requestContext.requestId,
          apiKeyId: requestContext.apiKeyId,
          userId: requestContext.userId,
          projectId: requestContext.projectId,
          apiPath: requestContext.apiPath,
          params: { context_id: body.contextId },
        }),
        this.buildEmotionModelLog({
          requestId: requestContext.requestId,
          apiKeyId: requestContext.apiKeyId,
          userId: requestContext.userId,
          projectId: requestContext.projectId,
          modelName: "emotion-v2",
          tokenUsage: emotionData.tokenInput || 25,
          isContextual: !!body.contextId,
        }),
        this.buildLLMModelLog({
          requestId: requestContext.requestId,
          apiKeyId: requestContext.apiKeyId,
          userId: requestContext.userId,
          projectId: requestContext.projectId,
          modelName: body.model,
          tokenUsage: result.usage.total_tokens,
          provider: this.getProviderFromModel(body.model),
          isContextual: !!body.contextId,
        }),
      ];

      await this.usageQueue?.batchPublish(usageLogs).catch((err) => {
        this.logger.error("[ChatServiceV2] Error sending usage logs:", err);
      });

      return result;
    } catch (err: unknown) {
      this.logger.error("[ChatServiceV2] handleChatCompletionV2 failed", {
        error: (err instanceof Error ? err.message : String(err)),
        contextId: body.contextId,
      });
      throw new Error(`Chat completion failed (V2): ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  /**
   * Determine the provider from the model name
   */
  private getProviderFromModel(model: string): string {
    if (model.startsWith("gpt")) return "openai";
    if (model.startsWith("claude")) return "anthropic";
    if (model.startsWith("grok") || model.startsWith("x-")) return "xai";
    return "unknown";
  }
}
