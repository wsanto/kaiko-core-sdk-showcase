import OpenAI from 'openai';
import { LLMError, RateLimitError } from '../errors/llm.error';
import { GenerateOptions, LLMConfig, LLMMessage, LLMResponse } from '../types';
import { BaseAdapter } from './base.adapter';

/**
 * Kimi (Moonshot) Adapter
 *
 * Uses Moonshot's Kimi API which is OpenAI-compatible.
 * API Documentation: https://platform.moonshot.ai/docs
 *
 * Models:
 * - kimi-k2-thinking-turbo: Fast thinking model (recommended)
 * - kimi-k2-thinking: Standard thinking model with deeper reasoning
 */
export class KimiAdapter extends BaseAdapter {
    private client: OpenAI;
    private static readonly BASE_URL = 'https://api.moonshot.ai/v1';

    public readonly CAPABILITY_MODELS = [
        "kimi-k2-thinking-turbo",
        "kimi-k2-thinking",
    ];

    constructor(config: LLMConfig) {
        super(config);
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL || KimiAdapter.BASE_URL,
            timeout: config.timeout || 60000, // Longer timeout for thinking models
        });
    }

    async generate(
        prompt: string | LLMMessage[],
        options: GenerateOptions
    ): Promise<LLMResponse> {
        return this.withRetry(async () => {
            const messages = this.normalizePrompt(prompt);

            const response = await this.client.chat.completions.create({
                model: options.model,
                messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                max_tokens: options.maxTokens || 1024,
                temperature: options.temperature || 0.7,
            }).catch((error) => {
                if (error.status === 429) {
                    throw new RateLimitError(error.message, this.getProviderName());
                }
                if (error.status === 401) {
                    throw new LLMError(
                        'Invalid Kimi API key',
                        this.getProviderName(),
                        401,
                        error
                    );
                }
                throw new LLMError(
                    error.message || 'Unknown error',
                    this.getProviderName(),
                    error.status,
                    error
                );
            });

            const choice = response.choices[0];
            if (!choice?.message?.content) {
                throw new LLMError('No content in response', this.getProviderName());
            }

            return {
                content: choice.message.content,
                usage: response.usage ? {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens,
                } : undefined,
                provider: this.getProviderName(),
                model: response.model,
                finishReason: choice.finish_reason || undefined,
            };
        });
    }

    validateConfig(): boolean {
        // Kimi API keys start with 'sk-'
        return !!(this.config.apiKey && this.config.apiKey.startsWith('sk-'));
    }

    getProviderName(): string {
        return 'kimi';
    }
}
