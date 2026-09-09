import { UsageLogHelpers } from '@shared/helpers/usage_log';
import { QueuePublisher } from '@shared/services/sqs.publisher';
import { UsageLogPayloadBody } from '@shared/types/usage_log.payload';
import { randomUUID } from 'crypto';
import dayjs from "dayjs";
import { and, eq, sql } from 'drizzle-orm';
import { groupBy, map, mapObject, pipe } from 'rambda';
import { autoInjectable, inject } from "tsyringe";
import { Logger } from 'winston';
import { Database, conversationContext, emotionsMessage } from '../../db';
import { EmotionClassificationService } from "./emotion-classification.service";
import { AnalyseAndStoreParams, AnalyseParams, EmotionItem, GetContextEmotions, GetMessageParams, RawEmotionScores } from "./types";


@autoInjectable()
export default class EmotionService extends UsageLogHelpers {
  fold

  constructor(
    @inject("DB") private database: Database,
    @inject("LOGGER") private logger: Logger,
    @inject(EmotionClassificationService)
    private classificationService: EmotionClassificationService,
    @inject("UsageLogQueue") private usageQueue?: QueuePublisher<UsageLogPayloadBody>,
  ) {
    super();
  }

  async analyseAndStore(params: AnalyseAndStoreParams) {
    const messages = params.body.messages;
    const context = await this.findOrCreateContext(params.userId, params.externalContextId);
    const analysed = await this.classificationService.batchClassify(messages.map(m => m.content.text));

    await this.createEmotionMessages(
      messages.map((m, i) => {
        const role = m.role || "_default";
        // Filter out undefined values to match database schema
        const results = analysed.batches[i].results || {};
        const predict = Object.fromEntries(
          Object.entries(results).filter(([, v]) => v !== undefined)
        ) as Record<string, number>;

        return {
          contextId: context.id,
          emotionsResults: {
            model: params.body.model,
            predict
          },
          role: role,
          externalId: m.externalId || randomUUID(),
          createdAt: dayjs(m.timestamp).toDate() || undefined,
          message: m.content.text
        };
      })
    );

    const emotionByRoles = pipe(
      messages,
      map((m, i) => ({
        message: m,
        emotions: analysed.batches[i].results || {}
      })),
      groupBy(m => m.message.role || "_default"),
      mapObject((group) => {
        const avgEmotion = this.averageEmotions((group || []).map(v => v.emotions));
        return this.emotionItemFromAnalysePrediction(avgEmotion);
      }),
    );

    {
      const requestParams = {
        requestId: params.requestId,
        apiKeyId: params.apiKeyId,
        userId: params.userId,
        projectId: params.projectId,
      }
      const usageLogs: UsageLogPayloadBody[] = [
        this.buildRequestLogs({
          ...requestParams,
          apiPath: params.apiPath,
          params: params.requestParams,
        }),
        this.buildEmotionModelLog({
          ...requestParams,
          modelName: params.body.model,
          isContextual: true,
          tokenUsage: analysed.totalTokenInput,
        })
      ]

      // dismiss the error
      await this.usageQueue?.batchPublish(usageLogs).catch((err) => {
        this.logger.error("Error sending usage logs:", err);
      });
    }
    return {
      model: params.body.model,
      emotions: emotionByRoles,
      usage: {
        analyseToken: analysed.totalTokenInput,
      }
    };
  }

  async analyse(params: AnalyseParams) {
    const messages = params.body.messages;

    const analysed = await this.classificationService.batchClassify(messages.map(m => m.content.text));
    const emotionByRoles = pipe(
      messages,
      map((m, i) => ({
        message: m,
        emotions: analysed.batches[i].results || {}
      })),
      groupBy(m => m.message.role || "_default"),
      mapObject((group) => {
        const avgEmotion = this.averageEmotions((group || []).map(v => v.emotions));

        return this.emotionItemFromAnalysePrediction(avgEmotion);
      }),
    );


    {
      const requestParams = {
        requestId: params.requestId,
        apiKeyId: params.apiKeyId,
        userId: params.userId,
        projectId: params.projectId,
      }
      const usageLogs: UsageLogPayloadBody[] = [
        this.buildRequestLogs({
          ...requestParams,
          apiPath: params.apiPath,
          params: params.requestParams,
        }),
        this.buildEmotionModelLog({
          ...requestParams,
          modelName: params.body.model,
          isContextual: true,
          tokenUsage: analysed.totalTokenInput,
        })
      ]

      // dismiss the error
      await this.usageQueue?.batchPublish(usageLogs).catch((err) => {
        this.logger.error("Error sending usage logs:", err);
      });
    }

    return {
      emotionByRoles: emotionByRoles,
      usage: {
        analyseToken: analysed.totalTokenInput,
      }
    };
  }

  async batchAnalyse(params: AnalyseParams) {
    const messages = params.body.messages;

    const analysed = await this.classificationService.batchClassify(messages.map(m => m.content.text));


    const emotionsItems = pipe(
      analysed.batches,
      map((result) => this.emotionItemFromAnalysePrediction(result.results))
    );


    {
      const requestParams = {
        requestId: params.requestId,
        apiKeyId: params.apiKeyId,
        userId: params.userId,
        projectId: params.projectId,
      }
      const usageLogs: UsageLogPayloadBody[] = [
        this.buildRequestLogs({
          ...requestParams,
          apiPath: params.apiPath,
          params: params.requestParams,
        }),
        this.buildEmotionModelLog({
          ...requestParams,
          modelName: params.body.model,
          isContextual: true,
          tokenUsage: analysed.totalTokenInput,
        })
      ]

      // dismiss the error
      await this.usageQueue?.batchPublish(usageLogs).catch((err) => {
        this.logger.error("Error sending usage logs:", err);
      });
    }

    return {
      emotions: emotionsItems,
      usage: {
        analyseToken: analysed.totalTokenInput,
      }
    };
  }
  async getContextEmotions(params: GetContextEmotions) {
    const context = await this.findOrCreateContext(params.userId, params.externalContextId);
    const emotions = await this.database.select({
      id: emotionsMessage.id,
      role: emotionsMessage.role,
      createdAt: emotionsMessage.createdAt,
      emotionsResults: emotionsMessage.emotionsResults,
      rowNum: sql<number>`ROW_NUMBER() OVER (
      PARTITION BY ${emotionsMessage.role}
      ORDER BY ${emotionsMessage.createdAt} DESC
    )`.as("row_num"),
    }).from(emotionsMessage).where(
      eq(emotionsMessage.contextId, context.id)
    );

    // TODO: enhanced with last N message on Avg emotions.

    {
      const requestParams = {
        requestId: params.requestId,
        apiKeyId: params.apiKeyId,
        userId: params.userId,
        projectId: params.projectId,
      }
      const usageLogs: UsageLogPayloadBody[] = [
        this.buildRequestLogs({
          ...requestParams,
          apiPath: params.apiPath,
          params: params.requestParams,
        })
      ];

      // dismiss the error
      await this.usageQueue?.batchPublish(usageLogs).catch((err) => {
        this.logger.error("Error sending usage logs:", err);
      });
    }

    return emotions.reduce((acc, cur) => {
      acc[cur.role || "_default"] = this.emotionItemFromAnalysePrediction(cur.emotionsResults.predict as RawEmotionScores);
      return acc;
    }, {} as Record<string, EmotionItem>);
  }

  async getMessage(params: GetMessageParams) {
    const context = await this.findOrCreateContext(params.userId, params.externalContextId);

    const message = await this.database.query.emotionsMessage.findFirst({
      where: and(
        eq(emotionsMessage.contextId, context.id),
        eq(emotionsMessage.externalId, params.externalMessageId),
      )
    })

    if (!message) {
      return null;
    }

    {
      const requestParams = {
        requestId: params.requestId,
        apiKeyId: params.apiKeyId,
        userId: params.userId,
        projectId: params.projectId,
      }
      const usageLogs: UsageLogPayloadBody[] = [this.buildRequestLogs({
        ...requestParams,
        apiPath: params.apiPath,
        params: params.requestParams,
      })];

      // dismiss the error
      await this.usageQueue?.batchPublish(usageLogs).catch((err) => {
        this.logger.error("Error sending usage logs:", err);
      });
    }

    return {
      message: message,
      emotions: {
        [message.role]: this.emotionItemFromAnalysePrediction(message.emotionsResults.predict as RawEmotionScores)
      }
    };
  }


  private async createEmotionMessages(records: (typeof emotionsMessage.$inferInsert)[]) {
    const data = await this.database.insert(emotionsMessage).values(records)
      .returning().onConflictDoUpdate({
        target: [emotionsMessage.contextId, emotionsMessage.externalId],
        set: {
          role: emotionsMessage.role,
          message: emotionsMessage.message,
          createdAt: emotionsMessage.createdAt,
          emotionsResults: emotionsMessage.emotionsResults
        }
      })
      .execute();

    return data;
  }

  private emotionItemFromAnalysePrediction(prediction: RawEmotionScores): EmotionItem {
    const [category, value] = Object.entries(prediction)
      .reduce((max, curr) => (curr[1] ?? 0) > (max[1] ?? 0) ? curr : max);

    return {
      text: this.classificationService.enrichEmotion(category, value ?? 0),
      category: category,
      raw: prediction,
    };
  }

  private async findOrCreateContext(userId: string, externalContextID: string) {
    const data = await this.database.query.conversationContext.findFirst({
      where: and(
        eq(conversationContext.userId, userId),
        eq(conversationContext.externalId, externalContextID)
      )
    });

    if (!data) {
      const [newContext] = await this.database
        .insert(conversationContext)
        .values({
          userId: userId,
          externalId: externalContextID
        })
        .returning()
        .onConflictDoNothing()
        .execute();

      return newContext;
    }

    return data;
  }

  private averageEmotions(group: Array<RawEmotionScores>): RawEmotionScores {
    const freq = {} as Record<string, number>;

    const summed = group.reduce((acc, curr) => {
      for (const [key, value] of Object.entries(curr)) {
        if (value !== undefined) {
          acc[key] = (acc[key] || 0) + value;
          freq[key] = (freq[key] || 0) + 1;
        }
      }
      return acc;
    }, {} as RawEmotionScores);

    Object.keys(summed).forEach(key => {
      const sum = summed[key];
      if (sum !== undefined) {
        summed[key] = sum / freq[key];
      }
    });

    return summed;
  }
}
