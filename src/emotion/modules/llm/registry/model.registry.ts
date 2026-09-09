import { ConfigurationError } from '../errors/llm.error';
import { LLMAdapter } from '../types';

export class ModelRegistry {
    private registry = new Map<string, LLMAdapter>();

    register(adapter: LLMAdapter): void {
        for (const model of adapter.CAPABILITY_MODELS) {
            if (this.registry.has(model)) {
                console.warn(`Model "${model}" is already registered. Overwriting with ${adapter.getProviderName()} adapter.`);
            }
            this.registry.set(model, adapter);
        }
    }

    isModelExist(modelName: string): boolean {
        return this.registry.has(modelName);
    }

    getAdapter(modelName: string): LLMAdapter {
        const adapter = this.registry.get(modelName);
        if (!adapter) {
            throw new ConfigurationError(
                `No adapter found for model "${modelName}". Available models: ${this.getAvailableModels().join(', ')}`,
                'unknown'
            );
        }
        return adapter;
    }

    getAvailableModels(): string[] {
        return Array.from(this.registry.keys());
    }

    unregisterModel(modelName: string): boolean {
        return this.registry.delete(modelName);
    }

    unregisterAdapter(adapter: LLMAdapter): void {
        for (const model of adapter.CAPABILITY_MODELS) {
            this.registry.delete(model);
        }
    }

    clear(): void {
        this.registry.clear();
    }
}