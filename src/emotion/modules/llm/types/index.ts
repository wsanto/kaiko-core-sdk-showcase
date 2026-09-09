export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: string;
  model?: string;
  finishReason?: string;
}

export interface LLMConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  [key: string]: any;
}

export interface GenerateOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  [key: string]: any;
}

export interface LLMAdapter {
  readonly CAPABILITY_MODELS: string[];

  generate(
    prompt: string | LLMMessage[],
    options: GenerateOptions
  ): Promise<LLMResponse>;

  generateBatch(
    prompts: (string | LLMMessage[])[],
    options: GenerateOptions
  ): Promise<LLMResponse[]>;

  validateConfig(): boolean;
  getProviderName(): string;
}