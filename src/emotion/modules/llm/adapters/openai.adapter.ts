import OpenAI from 'openai';
import { LLMError, RateLimitError } from '../errors/llm.error';
import { GenerateOptions, LLMConfig, LLMMessage, LLMResponse } from '../types';
import { BaseAdapter } from './base.adapter';

export class OpenAIAdapter extends BaseAdapter {
    private client: OpenAI;
    public readonly CAPABILITY_MODELS = [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-3.5-turbo"
    ];

    constructor(config: LLMConfig) {
        super(config);
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            timeout: config.timeout || 30000,
        });
    }

    async generate(
        prompt: string | LLMMessage[],
        options: GenerateOptions
    ): Promise<LLMResponse> {
        return this.withRetry(async () => {
            const messages = this.normalizePrompt(prompt);

            const response = await this.client.chat.completions.create({
                messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                max_tokens: options.maxTokens || 1000,
                temperature: options.temperature || 0.7,
                ...options
            }).catch((error) => {
                if (error.status === 429) {
                    throw new RateLimitError(error.message, this.getProviderName());
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
        return !!(this.config.apiKey && this.config.apiKey.startsWith('sk-'));
    }

    getProviderName(): string {
        return 'openai';
    }
}