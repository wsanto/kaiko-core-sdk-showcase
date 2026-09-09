export enum MetricCategory {
    EMOTION_MODEL = "emotion_model",
    LLM_MODEL = "llm_model",
    REQUESTS = "requests",
}

/**
 * API Key Types
 *
 * SYNAPSE is the recommended type for all new integrations.
 * Legacy types (END_TO_END, ANALYSE_ONLY) are preserved for backwards compatibility.
 */
export const API_KEY_TYPES = {
    /** Legacy: Full access to LLM and emotion endpoints */
    END_TO_END: '00000000-0000-4000-8000-000000000001',
    /** Legacy: Emotion analysis endpoints only */
    ANALYSE_ONLY: '00000000-0000-4000-8000-000000000002',
    /** Recommended: Universal access to all V1 and V2 endpoints */
    SYNAPSE: '00000000-0000-4000-8000-000000000003',
} as const;

/** Default API key type for new keys */
export const DEFAULT_API_KEY_TYPE = API_KEY_TYPES.SYNAPSE;

export const TOPUP_CREDITS_RATE = 125000; // 125,000 credits = 1 USD
export const TOPUP_TYPE = 'credit_topup';

//(avg_cost_per_million / 1_000_000) * 125_000 = credits per token
export const CREDIT_CONFIG = {
    [MetricCategory.EMOTION_MODEL]: {
        default: 3,
        names: {
            "emotion-v1": 1,
            "emotion-v2": 1,
        },
    },

    [MetricCategory.LLM_MODEL]: {
        default: 5,

        // === OPENAI ===
        "gpt-4o": 6.25 * 125000 / 1000000,        // ~0.78125
        "gpt-4o-mini": 0.375 * 125000 / 1000000,  // ~0.046875
        "gpt-4-turbo": 20 * 125000 / 1000000,     // ~2.5
        "gpt-3.5-turbo": 1 * 125000 / 1000000,    // ~0.125

        // === ANTHROPIC ===
        "claude-sonnet-4-5-20250929": 9 * 125000 / 1000000,     // ~1.125
        "claude-haiku-4-5-20251001": 0.75 * 125000 / 1000000,    // ~0.09375
        "claude-opus-4-1-20250805": 45 * 125000 / 1000000,      // ~5.625
        "claude-opus-4-20250514": 45 * 125000 / 1000000,        // ~5.625
        "claude-sonnet-4-20250514": 9 * 125000 / 1000000,       // ~1.125
        "claude-3-5-haiku-latest": 0.75 * 125000 / 1000000,     // ~0.09375

        // === XAI ===
        "grok-4": 10 * 125000 / 1000000,            // ~1.25
        "grok-3": 4 * 125000 / 1000000,             // ~0.5
        "grok-3-mini": 0.45 * 125000 / 1000000,     // ~0.05625
        "grok-code-fast-1": 2 * 125000 / 1000000,   // ~0.25
    },

    [MetricCategory.REQUESTS]: {
        default: 1,
        names: {
            "/v1/chat/completions": 2,
            "/v2/chat/completions": 2,
            "/v2/emotions/analysis": 1,
        },
    },
} as const;