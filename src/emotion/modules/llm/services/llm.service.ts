import { ConfigurationError } from '../errors/llm.error';
import { ModelRegistry } from '../registry/model.registry';
import { GenerateOptions, LLMAdapter, LLMMessage, LLMResponse } from '../types';

export class LLMService {
    private modelRegistry: ModelRegistry;

    constructor() {
        this.modelRegistry = new ModelRegistry();
    }

    registerAdapter(adapter: LLMAdapter): void {
        this.modelRegistry.register(adapter);
    }

    async generate(
        prompt: string | LLMMessage[],
        options: GenerateOptions
    ): Promise<LLMResponse> {
        if (!options.model) {
            throw new ConfigurationError('Model must be specified in options', 'unknown');
        }

        const adapter = this.modelRegistry.getAdapter(options.model);
        return adapter.generate(prompt, options);
    }

    async generateBatch(
        prompts: (string | LLMMessage[])[],
        options: GenerateOptions
    ): Promise<LLMResponse[]> {
        if (!options.model) {
            throw new ConfigurationError('Model must be specified in options', 'unknown');
        }

        const adapter = this.modelRegistry.getAdapter(options.model);
        return adapter.generateBatch(prompts, options);
    }

    isModelSupported(modelName: string): boolean {
        return this.modelRegistry.isModelExist(modelName);
    }

    getAvailableModels(): string[] {
        return this.modelRegistry.getAvailableModels();
    }
}
