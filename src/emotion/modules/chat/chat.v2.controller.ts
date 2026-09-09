import { VineValidator } from "@shared/utils";
import type { AppEnv } from "@shared/types/hono-env";
import { Hono } from "hono";
import { container } from "tsyringe";
import { VerifyApiKeyAndBalanceMiddleware } from "../../middlewares";
import ChatServiceV2 from "./chat.v2.service";
import { chatCompletionValidator } from "./chat.validator";

const chatServiceV2 = container.resolve(ChatServiceV2);
const chatV2Router = new Hono<AppEnv>();

chatV2Router.get("/", async (c) => {
  return c.json({ message: "Chat V2 service is running with enhanced EQ analysis." });
});

// V2: POST /v2/chat/completions
chatV2Router.post(
  "/completions",
  VerifyApiKeyAndBalanceMiddleware(),
  VineValidator("json", chatCompletionValidator),
  async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("userId")!;
    const apiKeyId = c.get("apiKeyId")!;
    const requestId = c.get("requestId")!;
    const projectId = c.get("projectId")!;
    const result = await chatServiceV2.handleChatCompletionV2(body, {
      userId,
      apiKeyId,
      requestId,
      projectId,
      apiPath: c.req.routePath,
    });
    return c.json(result);
  }
);

export default chatV2Router;
