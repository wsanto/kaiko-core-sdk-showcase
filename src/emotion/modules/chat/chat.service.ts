import { UsageLogHelpers } from "@shared/helpers/usage_log";
import { QueuePublisher } from "@shared/services/sqs.publisher";
import { UsageLogPayloadBody } from "@shared/types/usage_log.payload";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { EmotionClassificationService } from "../emotion/emotion-classification.service";
import { EmotionApiResponse } from "../emotion/types";
import { LLMService } from "../llm/services/llm.service";
import { compileEmotionalPrompt, determinePromptType } from "./prompt.compiler";
import { ChatCompletionResponse, HandleChatCompletionParams } from "./types";


@autoInjectable()
export default class ChatService extends UsageLogHelpers {
  constructor(
    @inject("LLMService") private llmService: LLMService,
    @inject("LOGGER") private logger: Logger,
    @inject(EmotionClassificationService)
    private emotionService: EmotionClassificationService,
    @inject("UsageLogQueue") private usageQueue?: QueuePublisher<UsageLogPayloadBody>,
  ) {
    super();
  }

  async handleChatCompletion(params: HandleChatCompletionParams): Promise<ChatCompletionResponse> {
    const body = params.body;

    const userMessage = body.messages.find(m => m.role === "user")?.content ?? "";

    const classifyAndFormat = async (message: string) => {
      const data = await this.emotionService.classify(message);
      return { data, formatted: this.formatEmotionResponse(data) };
    };

    const { data: userEmotionData, formatted: userEmotionFormatted } = await classifyAndFormat(userMessage);

    const compileEmotional = compileEmotionalPrompt(userEmotionData.results, determinePromptType(userEmotionData.results));

    if (!this.llmService.isModelSupported(body.model)) {
      throw new Error(`Model ${body.model} is not supported. Available: ${this.llmService.getAvailableModels().join(', ')}`);
    }

    const llmResponse = await this.llmService.generate(
      [
        { content: compileEmotional, role: "system" },
        { content: userMessage, role: "user" }
      ],
      { model: body.model }
    );

    const { data: assistantEmotionData, formatted: assistantEmotionFormatted } = await classifyAndFormat(llmResponse.content);

    const promptTokens = Number(llmResponse?.usage?.promptTokens ?? 0);
    const completionTokens = Number(llmResponse?.usage?.completionTokens ?? 0);
    const analyseTokens = Number(userEmotionData?.tokenUsage) + Number(assistantEmotionData?.tokenUsage);
    const totalTokens = promptTokens + completionTokens + analyseTokens;

    const nowSec = Math.floor(Date.now() / 1000);

    const result: ChatCompletionResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: nowSec,
      model: body.model,
      emotionModel: body.emotionModel,
      choices: [{ index: 0, message: { role: "assistant", content: llmResponse.content }, finishReason: "stop" }],
      emotions: { user: userEmotionFormatted, assistant: assistantEmotionFormatted },
      usage: { promptTokens, completionTokens, analyseTokens, totalTokens },
    };

    {

      const requestParams = {
        requestId: params.requestId,
        apiKeyId: params.apiKeyId,
        userId: params.userId,
        projectId: params.projectId,
      }

      const usageLogs: UsageLogPayloadBody[] = [
        this.buildLLMModelLog({
          ...requestParams,
          provider: llmResponse.provider,
          modelName: body.model,
          tokenUsage: llmResponse.usage?.totalTokens || 0,
        }),
        this.buildEmotionModelLog({
          ...requestParams,
          modelName: body.emotionModel,
          isContextual: true,
          tokenUsage: (userEmotionData.tokenUsage || 0) + (assistantEmotionData.tokenUsage || 0),
        }),
        this.buildRequestLogs({
          ...requestParams,
          apiPath: params.apiPath,
          params: params.requestParams,
        })
      ];

      await this.usageQueue?.batchPublish(usageLogs).catch((err) => {
        this.logger.error("Error sending usage logs:", err);
      });
    }

    return result;
  }



  private formatEmotionResponse(emotionData: EmotionApiResponse) {
    const emotions = emotionData.results;
    const dominantEmotion = Object.keys(emotions).reduce((a, b) =>
      (emotions[a] ?? 0) > (emotions[b] ?? 0) ? a : b
    );
    const emotionText = this.emotionService.enrichEmotion(dominantEmotion, emotions[dominantEmotion] ?? 0)
    return {
      text: emotionText,
      category: dominantEmotion,
      raw: emotions,
    };
  }
}
