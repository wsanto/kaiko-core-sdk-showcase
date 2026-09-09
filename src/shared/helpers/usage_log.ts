import { CREDIT_CONFIG, MetricCategory } from "@shared/constants";
import { UsageLogPayloadBody } from "@shared/types/usage_log.payload";
import dayjs from "dayjs";

export function getCredits(category: MetricCategory, name: string, value: number): number {
    const config = CREDIT_CONFIG[category] as Record<string, unknown>;
    // Check for 'names' sub-object first (EMOTION_MODEL, REQUESTS), then direct property (LLM_MODEL)
    const names = config?.names as Record<string, number> | undefined;
    const creditRate = names?.[name] ?? (config?.[name] as number | undefined) ?? (config?.default as number | undefined) ?? 1;
    return creditRate * value;
}


export class UsageLogHelpers {
    buildEmotionModelLog({
        requestId,
        apiKeyId,
        userId,
        projectId,
        modelName,
        tokenUsage,
        isContextual,
        timestamp,
    }: {
        requestId: string;
        apiKeyId: string;
        userId: string;
        projectId: string;
        modelName: string;
        tokenUsage: number;
        isContextual?: boolean;
        timestamp?: Date;
    }): UsageLogPayloadBody {
        return {
            requestId,
            apiKeyId,
            userId,
            projectId,
            metricCategory: MetricCategory.EMOTION_MODEL,
            metricName: modelName,
            value: tokenUsage,
            metadata: {
                contextual: isContextual,
                provider: "kaiko",
            },
            timestamp: dayjs(timestamp || new Date()).unix(),
        };
    }

    buildLLMModelLog({
        requestId,
        apiKeyId,
        userId,
        projectId,
        modelName,
        tokenUsage,
        timestamp,
        provider,
        isContextual,
    }: {
        requestId: string;
        apiKeyId: string;
        userId: string;
        projectId: string;
        modelName: string;
        tokenUsage: number;
        isContextual?: boolean;
        timestamp?: Date;
        provider: string;
    }): UsageLogPayloadBody {
        return {
            requestId,
            apiKeyId,
            userId,
            projectId,
            metricCategory: MetricCategory.LLM_MODEL,
            metricName: modelName,
            value: tokenUsage,
            metadata: {
                contextual: isContextual,
                provider,
            },
            timestamp: dayjs(timestamp || new Date()).unix(),
        };
    }

    buildRequestLogs({
        requestId,
        apiKeyId,
        userId,
        projectId,
        params,
        apiPath,
        timestamp,
    }: {
        requestId: string;
        apiKeyId: string;
        userId: string;
        projectId: string;
        apiPath: string;
        params: Record<string, any>;
        timestamp?: Date;
    }): UsageLogPayloadBody {
        return {
            requestId,
            apiKeyId,
            userId,
            projectId,
            metricCategory: MetricCategory.REQUESTS,
            metricName: apiPath,
            value: 1,
            metadata: params,
            timestamp: dayjs(timestamp || new Date()).unix(),
        };
    }
}
