import { ParseGatewayDataMiddleware } from "@shared/middlewares";
import { Response, VineValidator } from "@shared/utils";
import { Hono } from "hono";
import { container } from "tsyringe";
import ApiKeyService from "./api_key.service";
import { apiKeyListQueryValidator, apiKeyUpdateBodyValidator } from "./api_key.validator";

const apiKeyService = container.resolve(ApiKeyService);
const apiKeyRouter = new Hono();

apiKeyRouter.get(
  "types",
  ParseGatewayDataMiddleware(),
  async (c) => {
    const types = await apiKeyService.listTypes();
    return Response.success(c, { data: types });
  }
);

apiKeyRouter.get(
  "",
  ParseGatewayDataMiddleware(),
  VineValidator("query", apiKeyListQueryValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { projectId, typeId, isActive, name } = c.req.valid("query");
    const apiKeys = await apiKeyService.list(userId, {
      name,
      projectId,
      typeId,
      isActive,
    });

    return Response.success(c, { data: apiKeys });
  }
);

apiKeyRouter.put(
  ":id",
  ParseGatewayDataMiddleware(),
  VineValidator("json", apiKeyUpdateBodyValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.param();
    const payload = c.req.valid("json");

    const valid = await apiKeyService.isValidApiKey(userId, id);
    if (!valid) {
      return Response.error(c, {
        code: 400,
        message: "Api key not found or does not belong to user",
      });
    }
    const updated = await apiKeyService.update(id, payload);

    if (!updated) {
      return Response.error(c, { code: 404, message: "API key not found or not belong to user" });
    }
    return Response.success(c, { data: updated });
  }
);

apiKeyRouter.post(
  ":id/rotate",
  ParseGatewayDataMiddleware(),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.param();
    const valid = await apiKeyService.isValidApiKey(userId, id);
    if (!valid) {
      return Response.error(c, { code: 400, message: "Api key not found or does not belong to user" });
    }
    const rotated = await apiKeyService.rotate(id);
    if (!rotated) {
      return Response.error(c, { code: 500, message: "Failed to rotate API key" });
    }

    return Response.success(c, { data: rotated });
  }
);

apiKeyRouter.post(
  ":id/pause",
  ParseGatewayDataMiddleware(),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.param();

    const valid = await apiKeyService.isValidApiKey(userId, id);
    if (!valid) {
      return Response.error(c, { code: 400, message: "Api key not found or does not belong to user" });
    }

    const paused = await apiKeyService.pause(id);
    if (!paused) return Response.error(c, { code: 500, message: "Failed to pause API key" });

    return Response.success(c, { data: paused });
  }
);

apiKeyRouter.post(
  ":id/resume",
  ParseGatewayDataMiddleware(),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.param();

    const valid = await apiKeyService.isValidApiKey(userId, id);
    if (!valid) {
      return Response.error(c, { code: 400, message: "Api key not found or does not belong to user" });
    }

    const resumed = await apiKeyService.resume(id);
    if (!resumed) return Response.error(c, { code: 500, message: "Failed to resume API key" });

    return Response.success(c, { data: resumed });
  }
);

apiKeyRouter.get(
  ":id/status",
  async (c) => {
    const { id } = c.req.param();

    const status = await apiKeyService.checkStatus(id);
    if (!status) {
      return Response.error(c, { code: 404, message: "API key or project not found" });
    }

    return Response.success(c, { data: status });
  }
);

export default apiKeyRouter;
