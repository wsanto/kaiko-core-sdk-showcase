import { Response, VineValidator } from "@shared/utils";
import type { AppEnv } from "@shared/types/hono-env";
import { Hono } from "hono";
import { container } from "tsyringe";
import { VerifyApiKeyAndBalanceMiddleware } from "../../middlewares";
import EmotionService from "./emotion.service";
import { analyseEmotionValidator } from "./emotion.validator";
import { AnalyseEmotionResponse, BatchAnalyseResponse, StateEmotionResponse } from "./types";


const emotionRouter = new Hono<AppEnv>();

// POST /v1/emotions/:externalContextId/analyse
emotionRouter.post(
  "/:externalContextId/analyse",
  VerifyApiKeyAndBalanceMiddleware(),
  VineValidator("json", analyseEmotionValidator),
  async (c) => {
    const emotionService = container.resolve(EmotionService);

    const { externalContextId } = c.req.param();
    const body = c.req.valid("json");
    const userId = c.get("userId")!;
    const apiKeyId = c.get("apiKeyId")!;
    const requestId = c.get("requestId")!;
    const projectId = c.get("projectId")!;
    const param = {
      externalContextId,
      userId,
      body,
      requestId,
      apiKeyId,
      requestParams: c.req.param(),
      projectId,
      apiPath: c.req.routePath
    }
    const data = await emotionService.analyseAndStore(param);

    return Response.success(c, {
      disableCaseCasting: true,
      data: {
        object: "emotions.analyse" as const,
        model: data.model,
        metadata: {
          context_id: externalContextId,
        } as Record<string, any>,
        params: c.req.param(),
        emotions: data.emotions,
        usage: {
        },
      } as AnalyseEmotionResponse
    })
  }
);

// GET /v1/emotions/:externalContextId
emotionRouter.get("/:externalContextId",
  async (c) => {
    const emotionService = container.resolve(EmotionService);

    const { externalContextId } = c.req.param();
    const userId = c.get("userId")!;
    const apiKeyId = c.get("apiKeyId")!;
    const requestId = c.get("requestId")!;
    const projectId = c.get("projectId")!;

    const emotionMap = await emotionService.getContextEmotions({
      userId,
      externalContextId,
      apiKeyId,
      requestId,
      requestParams: c.req.param(),
      projectId,
      apiPath: c.req.routePath
    });

    return Response.success(c, {
      disableCaseCasting: true,
      data: {
        object: "emotions.state" as const,
        model: "emotion-v1",
        emotions: emotionMap,
        params: c.req.param(),
        metadata: {
          context_id: externalContextId,
        } as Record<string, any>,
        usage: {}
      } as StateEmotionResponse
    });
  });

// GET /v1/emotions/:externalContextId/message/:externalMessageId
emotionRouter.get("/:externalContextId/message/:externalMessageId",
  async (c) => {
    const emotionService = container.resolve(EmotionService);

    const { externalContextId, externalMessageId } = c.req.param();
    const userId = c.get("userId")!;
    const apiKeyId = c.get("apiKeyId")!;
    const requestId = c.get("requestId")!;
    const projectId = c.get("projectId")!;

    const param = {
      externalContextId,
      externalMessageId,
      userId,
      apiKeyId,
      requestId,
      requestParams: c.req.param(),
      projectId,
      apiPath: c.req.routePath
    }
    const data = await emotionService.getMessage(param);
    if (!data) {
      return Response.error(c, {
        message: "Message not found",
        code: 404
      });
    }

    const { message, emotions } = data;

    return Response.success(c, {
      disableCaseCasting: true,
      data: {
        object: "emotions.state" as const,
        model: message.emotionsResults.model,
        params: c.req.param(),
        metadata: {
          context_id: externalContextId,
          message_id: externalMessageId,
        } as Record<string, any>,
        emotions: emotions,
        usage: {},
      } as StateEmotionResponse
    });
  });

// POST /v1/emotions/analyse
emotionRouter.post("/analyse",
  VerifyApiKeyAndBalanceMiddleware(),
  VineValidator("json", analyseEmotionValidator),
  async (c) => {
    const emotionService = container.resolve(EmotionService);

    const body = c.req.valid("json");
    const userId = c.get("userId")!;
    const apiKeyId = c.get("apiKeyId")!;
    const requestId = c.get("requestId")!;
    const projectId = c.get("projectId")!;

    const param = {
      userId,
      body,
      apiKeyId,
      requestId,
      projectId,
      requestParams: c.req.param(),
      apiPath: c.req.routePath
    }

    const data = await emotionService.analyse(param);

    return Response.success(c, {
      disableCaseCasting: true,
      data: {
        object: "emotions.analyse" as const,
        model: body.model,
        params: c.req.param(),
        emotions: data.emotionByRoles,
        metadata: {},
        usage: data.usage,
      } as AnalyseEmotionResponse
    });
  }
);

emotionRouter.post("/batch-analyse",
  VerifyApiKeyAndBalanceMiddleware(),
  VineValidator("json", analyseEmotionValidator),
  async (c) => {
    const emotionService = container.resolve(EmotionService);

    const body = c.req.valid("json");
    const userId = c.get("userId")!;
    const apiKeyId = c.get("apiKeyId")!;
    const requestId = c.get("requestId")!;
    const projectId = c.get("projectId")!;

    const param = {
      userId,
      body,
      apiKeyId,
      requestId,
      projectId,
      requestParams: c.req.param(),
      apiPath: c.req.routePath
    };
    const data = await emotionService.batchAnalyse(param);

    return Response.success(c, {
      disableCaseCasting: true,
      data: {
        object: "emotions.batch_analyse" as const,
        model: body.model,
        params: body.params,
        emotions: data.emotions,
        metadata: {},
        usage: data.usage,
      } as BatchAnalyseResponse
    });
  }
);

export default emotionRouter;
