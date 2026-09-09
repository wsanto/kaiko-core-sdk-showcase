import { LLMAdapter, LLMConfig, LLMMessage, LLMResponse, GenerateOptions } from '../types';
import { ConfigurationError } from '../errors/llm.error';

export abstract class BaseAdapter implements LLMAdapter {
    public abstract readonly CAPABILITY_MODELS: string[];

    protected config: LLMConfig;

    constructor(config: LLMConfig) {
        this.config = config;
        if (!this.validateConfig()) {
            throw new ConfigurationError('Invalid configuration', this.getProviderName());
        }
    }

    abstract generate(prompt: string | LLMMessage[], options?: GenerateOptions): Promise<LLMResponse>;
    abstract validateConfig(): boolean;
    abstract getProviderName(): string;

    async generateBatch(prompts: (string | LLMMessage[])[], options?: GenerateOptions): Promise<LLMResponse[]> {
        return Promise.all(prompts.map(prompt => this.generate(prompt, options)));
    }

    protected normalizePrompt(prompt: string | LLMMessage[]): LLMMessage[] {
        if (typeof prompt === 'string') {
            return [{ role: 'user', content: prompt }];
        }
        return prompt;
    }

    protected async withRetry<T>(operation: () => Promise<T>, maxRetries: number = this.config.maxRetries || 3): Promise<T> {
        let lastError: any;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }
}