import Anthropic from '@anthropic-ai/sdk';
import { LLMError, RateLimitError } from '../errors/llm.error';
import { GenerateOptions, LLMConfig, LLMMessage, LLMResponse } from '../types';
import { BaseAdapter } from './base.adapter';

export class AnthropicAdapter extends BaseAdapter {
    private client: Anthropic;
    public readonly CAPABILITY_MODELS = [
        "claude-sonnet-4-5-20250929",
        "claude-haiku-4-5-20251001",
        "claude-opus-4-1-20250805",
        "claude-opus-4-20250514",
        "claude-sonnet-4-20250514",
        "claude-3-5-haiku-latest"
    ];

    constructor(config: LLMConfig) {
        super(config);
        this.client = new Anthropic({
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
            const systemMessage = messages.find(m => m.role === 'system');
            const chatMessages = messages.filter(m => m.role !== 'system');

            const response = await this.client.messages.create({
                messages: chatMessages.map(msg => ({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                })),
                system: systemMessage?.content,
                max_tokens: options.maxTokens || 1000,
                temperature: options.temperature || 0.7,
                ...options
            }).catch((error: any) => {
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

            const content = response.content[0];
            if (content.type !== 'text') {
                throw new LLMError('Non-text response received', this.getProviderName());
            }

            return {
                content: content.text,
                usage: response.usage ? {
                    promptTokens: response.usage.input_tokens,
                    completionTokens: response.usage.output_tokens,
                    totalTokens: response.usage.input_tokens + response.usage.output_tokens,
                } : undefined,
                provider: this.getProviderName(),
                model: response.model,
                finishReason: response.stop_reason || undefined,
            };
        });
    }


    validateConfig(): boolean {
        return !!(this.config.apiKey && this.config.apiKey.length > 0);
    }

    getProviderName(): string {
        return 'claude';
    }
}