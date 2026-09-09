import { Response, VineValidator } from "@shared/utils";
import { Hono } from "hono";
import { Bindings } from "hono/types";
import { container } from "tsyringe";
import BillingInternalService from "./billing-internal.service";
import { getApiKeyMonthlyStatsValidator, getApiKeysUsageValidator, getMonthlyStatsValidator, getProjectMonthlyStatsValidator, getProjectsUsageValidator, getProjectUsageValidator } from "./billing-internal.validator";

const billingInternalRouter = new Hono<{ Bindings: Bindings }>();
const billingInternalService = container.resolve(BillingInternalService);

billingInternalRouter.post(
    "/monthly-stats",
    VineValidator("json", getMonthlyStatsValidator),
    async (c) => {
        const query = c.req.valid("json");

        const stats = await billingInternalService.getMonthlyStats(query.userId, query.months);
        return Response.success(c, { data: stats });
    }
);

billingInternalRouter.post(
    "/project-usage",
    VineValidator("json", getProjectUsageValidator),
    async (c) => {
        const query = c.req.valid("json");

        const stats = await billingInternalService.getProjectUsage(query.userId, query.projectId, query.month);
        return Response.success(c, { data: stats });
    }
);

billingInternalRouter.post(
    "/project-monthly-stats",
    VineValidator("json", getProjectMonthlyStatsValidator),
    async (c) => {
        const query = c.req.valid("json");

        const stats = await billingInternalService.getProjectMonthlyStats(query.userId, query.projectId, query.months);
        return Response.success(c, { data: stats });
    }
);

billingInternalRouter.post(
    "/api-key-monthly-stats",
    VineValidator("json", getApiKeyMonthlyStatsValidator),
    async (c) => {
        const query = c.req.valid("json");

        const stats = await billingInternalService.getApiKeyMonthlyStats(query.userId, query.projectId, query.months);
        return Response.success(c, { data: stats });
    }
);

billingInternalRouter.get(
    "/users/:userId/balance",
    async (c) => {
        const userId = c.req.param("userId");

        const billing = await billingInternalService.getUserBilling(userId);

        if (!billing) {
            return Response.error(c, { message: "User billing not found", code: 404 });
        }

        return Response.success(c, { data: billing });
    }
);

billingInternalRouter.post(
    "/api-keys-usage",
    VineValidator("json", getApiKeysUsageValidator),
    async (c) => {
        const query = c.req.valid("json");
        const stats = await billingInternalService.getApiKeysUsage(query.apiKeyIds);
        return Response.success(c, { data: stats });
    }
);

billingInternalRouter.post(
    "/projects-usage",
    VineValidator("json", getProjectsUsageValidator),
    async (c) => {
        const query = c.req.valid("json");
        const stats = await billingInternalService.getProjectsUsageSummary(query.projectIds);
        return Response.success(c, { data: stats });
    }
);

export default billingInternalRouter;