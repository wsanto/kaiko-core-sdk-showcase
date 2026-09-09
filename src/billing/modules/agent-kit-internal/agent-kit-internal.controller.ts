import { Response, VineValidator } from "@shared/utils";
import { Hono } from "hono";
import { Bindings } from "hono/types";
import { container } from "tsyringe";
import AgentKitInternalService from "./agent-kit-internal.service";
import {
  getEndUserStatsValidator,
  logUsageValidator,
  registerEndUserValidator,
  verifyApiKeyValidator,
} from "./agent-kit-internal.validator";

const agentKitInternalRouter = new Hono<{ Bindings: Bindings }>();
const agentKitInternalService = container.resolve(AgentKitInternalService);

/**
 * Verify an API key
 * Used by Agent Kit backend to validate incoming requests
 *
 * POST /v1/billing/internal/agent-kit/verify-key
 */
agentKitInternalRouter.post(
  "/verify-key",
  VineValidator("json", verifyApiKeyValidator),
  async (c) => {
    const { apiKey } = c.req.valid("json");

    const result = await agentKitInternalService.verifyApiKey(apiKey);

    if (!result.valid) {
      return Response.error(c, {
        message: result.error || "Invalid API key",
        code: 401,
      });
    }

    return Response.success(c, { data: result });
  }
);

/**
 * Log usage from Agent Kit
 * Tracks usage and deducts credits (unless internal project)
 *
 * POST /v1/billing/internal/agent-kit/log-usage
 */
agentKitInternalRouter.post(
  "/log-usage",
  VineValidator("json", logUsageValidator),
  async (c) => {
    const body = c.req.valid("json");

    try {
      await agentKitInternalService.logUsage(body);
      return Response.success(c, {
        data: { logged: true },
      });
    } catch (error) {
      return Response.error(c, {
        message: "Failed to log usage",
        code: 500,
      });
    }
  }
);

/**
 * Register an end user for per-user billing
 * Only charges once per user per project per month
 *
 * POST /v1/billing/internal/agent-kit/register-user
 */
agentKitInternalRouter.post(
  "/register-user",
  VineValidator("json", registerEndUserValidator),
  async (c) => {
    const body = c.req.valid("json");

    const result = await agentKitInternalService.registerEndUser(body);

    return Response.success(c, { data: result });
  }
);

/**
 * Get end user statistics for a project
 *
 * POST /v1/billing/internal/agent-kit/end-user-stats
 */
agentKitInternalRouter.post(
  "/end-user-stats",
  VineValidator("json", getEndUserStatsValidator),
  async (c) => {
    const { projectId, month } = c.req.valid("json");

    const stats = await agentKitInternalService.getEndUserStats(projectId, month);

    return Response.success(c, { data: stats });
  }
);

export default agentKitInternalRouter;
