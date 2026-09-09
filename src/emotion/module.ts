import { container } from "tsyringe";
import * as winston from "winston";
import { createDB, Database } from "./db";
import { EmotionClassificationService } from "./modules/emotion/emotion-classification.service";
import { llmService } from "./modules/llm";
import { AnthropicAdapter } from "./modules/llm/adapters/anthropic.adapter";
import { KimiAdapter } from "./modules/llm/adapters/kimi.adapter";
import { OpenAIAdapter } from "./modules/llm/adapters/openai.adapter";
import { XAIAdapter } from "./modules/llm/adapters/xai.adapter";
import { LLMService } from "./modules/llm/services/llm.service";
import { QueuePublisher } from "@shared/services/sqs.publisher";
import { UsageLogPayloadBody } from "@shared/types/usage_log.payload";
import { AuthAdapterService, BillingAdapterService } from "./modules/adapters";
// Phase 6 V2 Services
import { EQAnalysisService } from "./modules/emotion/eq-analysis.service";
import { TrajectoryService } from "./modules/emotion/trajectory.service";
import { GrowthTrackingService } from "./modules/emotion/growth-tracking.service";
import { MemoryGraduationService } from "./modules/emotion/memory-graduation.service";
import { ConversationModeService } from "./modules/emotion/conversation-mode.service";
import { BeliefDetectionService } from "./modules/belief/belief-detection.service";
import EmotionServiceV2 from "./modules/emotion/emotion.v2.service";
import ChatServiceV2 from "./modules/chat/chat.v2.service";

let db: Database;
let logger: winston.Logger;
let llm: LLMService;
let usageQueue: QueuePublisher<UsageLogPayloadBody>;

container.register("DB", {
    useFactory: () => {
        return db ||= createDB();
    }
})

container.register("LOGGER", {
    useFactory: () => {
        return logger ||= winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            defaultMeta: { service: 'kaiko-emotion-api' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                }),
            ],
        });
    }
})


container.register("LLMService", {
    useFactory: () => {
        if (!llm) {
            const openaiApiKey = process.env.OPENAI_API_KEY;
            if (!openaiApiKey) throw new Error("OPENAI_API_KEY is not set.");
            llmService.registerAdapter(new OpenAIAdapter({ apiKey: openaiApiKey }));

            const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
            if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
            llmService.registerAdapter(new AnthropicAdapter({ apiKey: anthropicApiKey }));

            const xaiApiKey = process.env.XAI_API_KEY;
            if (!xaiApiKey) throw new Error("XAI_API_KEY is not set.");
            llmService.registerAdapter(new XAIAdapter({ apiKey: xaiApiKey }));

            const kimiApiKey = process.env.KIMI_API_KEY;
            if (!kimiApiKey) throw new Error("KIMI_API_KEY is not set.");
            llmService.registerAdapter(new KimiAdapter({ apiKey: kimiApiKey }));

            llm ||= llmService;
        }
        return llm;
    },
});

container.registerSingleton(EmotionClassificationService);
// Phase 6 V2 Services
container.registerSingleton(EQAnalysisService);          // Phase 1: EQ Analysis Service for V2 API
container.registerSingleton(TrajectoryService);          // Phase 2.1: Trajectory Tracking Service
container.registerSingleton(GrowthTrackingService);      // Phase 3.1: Growth Tracking Service
container.registerSingleton(MemoryGraduationService);    // Phase 3.2: Memory Graduation Service
container.registerSingleton(ConversationModeService);    // Phase 4.1: Conversation Mode Detection
container.registerSingleton(BeliefDetectionService);     // Phase 5.2: Belief Detection
container.registerSingleton(EmotionServiceV2);           // V2 Emotion Service
container.registerSingleton(ChatServiceV2);              // V2 Chat Service

container.register("UsageLogQueue", {
    useFactory: (deps) => {
        if (!usageQueue) {
            const logger = deps.resolve<winston.Logger>("LOGGER");
            return usageQueue ||= new QueuePublisher<UsageLogPayloadBody>(process.env.USAGE_LOG_QUEUE_NAME, logger);
        }
        return usageQueue;
    },
});

container.register("AuthAdapterService", {
    useFactory: (deps) => {
        const authApiBaseUrl = process.env.AUTH_API_BASE_URL;
        if (!authApiBaseUrl) throw new Error("AUTH_API_BASE_URL is not set.");
        const logger = deps.resolve<winston.Logger>("LOGGER");
        return new AuthAdapterService(logger, authApiBaseUrl);
    },
});

container.register("BillingAdapterService", {
    useFactory: (deps) => {
        if (!process.env.BILLING_API_BASE_URL) throw new Error("BILLING_API_BASE_URL is not set.");
        const logger = deps.resolve<winston.Logger>("LOGGER");
        return new BillingAdapterService(logger);
    },
});