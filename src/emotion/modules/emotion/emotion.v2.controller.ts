import { VineValidator } from "@shared/utils";
import type { AppEnv } from "@shared/types/hono-env";
import { Hono } from "hono";
import { container } from "tsyringe";
import { VerifyApiKeyAndBalanceMiddleware } from "../../middlewares";
import EmotionServiceV2 from "./emotion.v2.service";
import { analyseEmotionValidator } from "./emotion.validator";

const emotionServiceV2 = container.resolve(EmotionServiceV2);
const emotionV2Router = new Hono<AppEnv>();

emotionV2Router.get("/", async (c) => {
  return c.json({ message: "Emotion V2 service is running with enhanced EQ analysis." });
});

// V2: Context-Based API: POST /v2/emotions/:context_id/analysis (renamed from "analyse")
emotionV2Router.post(
  "/:context_id/analysis",
  VerifyApiKeyAndBalanceMiddleware(),
  VineValidator("json", analyseEmotionValidator),
  async (c) => {
    const { context_id: contextId } = c.req.param();
    const body = c.req.valid("json");
    const userId = c.get("userId")!;
    const apiKeyId = c.get("apiKeyId")!;
    const requestId = c.get("requestId")!;
    const projectId = c.get("projectId")!;
    const result = await emotionServiceV2.analyseAndStoreEmotionV2(contextId, body, {
      userId,
      apiKeyId,
      requestId,
      projectId,
      apiPath: c.req.routePath,
    });
    return c.json(result);
  }
);

// V2: Context-Based API: GET /v2/emotions/:context_id
emotionV2Router.get("/:context_id", async (c) => {
  const { context_id: contextId } = c.req.param();
  const result = await emotionServiceV2.getContextEmotionV2(contextId);
  return c.json(result);
});

// V2: Context-Based API: GET /v2/emotions/:context_id/message/:external_id
emotionV2Router.get("/:context_id/message/:external_id", async (c) => {
  const { context_id: contextId, external_id: externalId } = c.req.param();
  const result = await emotionServiceV2.getMessageEmotionV2(contextId, externalId);
  return c.json(result);
});

// V2: Non-Context API: POST /v2/emotions/analysis (renamed from "analyse")
emotionV2Router.post(
  "/analysis",
  VerifyApiKeyAndBalanceMiddleware(),
  VineValidator("json", analyseEmotionValidator),
  async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("userId")!;
    const apiKeyId = c.get("apiKeyId")!;
    const requestId = c.get("requestId")!;
    const projectId = c.get("projectId")!;
    const result = await emotionServiceV2.analyseStatelessEmotionV2(body, {
      userId,
      apiKeyId,
      requestId,
      projectId,
      apiPath: c.req.routePath,
    });
    return c.json(result);
  }
);

export default emotionV2Router;
