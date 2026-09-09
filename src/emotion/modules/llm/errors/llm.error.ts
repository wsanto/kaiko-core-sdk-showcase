export class LLMError extends Error {
    constructor(
        message: string,
        public provider: string,
        public statusCode?: number,
        public originalError?: any
    ) {
        super(message);
        this.name = 'LLMError';
    }
}

export class ConfigurationError extends LLMError {
    constructor(message: string, provider: string) {
        super(message, provider);
        this.name = 'ConfigurationError';
    }
}

export class RateLimitError extends LLMError {
    constructor(message: string, provider: string) {
        super(message, provider);
        this.name = 'RateLimitError';
    }
}