import { Response, VineValidator } from "@shared/utils";
import type { AppEnv } from "@shared/types/hono-env";
import { Hono } from "hono";
import { container } from "tsyringe";
import { VerifyApiKeyAndBalanceMiddleware } from "../../middlewares";
import ChatService from "./chat.service";
import { chatCompletionValidator } from "./chat.validator";


const chatRouter = new Hono<AppEnv>();

// POST /v1/chat/completions
chatRouter.post(
  "/completions",
  VerifyApiKeyAndBalanceMiddleware(),
  VineValidator("json", chatCompletionValidator),
  async (c) => {
    const chatService = container.resolve(ChatService);
    const body = c.req.valid("json");
    const userId = c.get("userId")!;
    const apiKeyId = c.get("apiKeyId")!;
    const requestId = c.get("requestId")!;
    const projectId = c.get("projectId")!;

    const result = await chatService.handleChatCompletion({
      userId,
      body,
      apiKeyId,
      requestId,
      requestParams: c.req.param(),
      projectId,
      apiPath: c.req.routePath
    });

    return Response.success(c, {
      data: result
    });
  }
);

export default chatRouter;
