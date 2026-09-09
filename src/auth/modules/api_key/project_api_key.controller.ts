import { ParseGatewayDataMiddleware } from "@shared/middlewares";
import { Response, VineValidator } from "@shared/utils";
import { Hono } from "hono";
import { container } from "tsyringe";
import ApiKeyService from "./api_key.service";
import { projectApiKeyCreateBodyValidator, projectApiKeyListQueryValidator, projectApiKeyParamsValidator, projectParamsValidator } from "./api_key.validator";

const apiKeyService = container.resolve(ApiKeyService);
const projectApiKeyRouter = new Hono();

projectApiKeyRouter.post(
  "",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectParamsValidator),
  VineValidator("json", projectApiKeyCreateBodyValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { projectId } = c.req.valid("param");
    const { name, keyTypeId, metadata } = c.req.valid("json");

    const valid = await apiKeyService.isValidProject(userId, projectId);
    if (!valid) {
      return Response.error(c, {
        code: 400,
        message: "Project not found or does not belong to user",
      });
    }

    const data = await apiKeyService.createByProjectId(projectId, {
      name,
      keyTypeId,
      metadata,
    });

    return Response.success(c, { data });
  }
);

projectApiKeyRouter.delete(
  ":id",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectApiKeyParamsValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { projectId, id } = c.req.valid("param");

    const valid = await apiKeyService.isValidProject(userId, projectId);
    if (!valid) {
      return Response.error(c, {
        code: 400,
        message: "Project not found or does not belong to user",
      });
    }

    const deletedApiKey = await apiKeyService.deleteByProjectId(projectId, id);
    if (!deletedApiKey) {
      return Response.error(c, { message: "API key not found", code: 404 });
    }

    return Response.success(c, { code: 200, data: deletedApiKey });
  }
);

projectApiKeyRouter.get(
  "",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectParamsValidator),
  VineValidator("query", projectApiKeyListQueryValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { projectId } = c.req.valid("param");
    const { typeId, isActive, name } = c.req.valid("query");

    const valid = await apiKeyService.isValidProject(userId, projectId);
    if (!valid) {
      return Response.error(c, {
        code: 400,
        message: "Project not found or does not belong to user",
      });
    }
    const apiKeys = await apiKeyService.listByProjectId(projectId, {
      typeId,
      isActive,
      name
    });

    return Response.success(c, { data: apiKeys });
  }
);



export default projectApiKeyRouter;
