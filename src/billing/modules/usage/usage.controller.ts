import { Response, VineValidator } from "@shared/utils";
import { parseSortParam } from "@shared/utils/query/sort";
import type { AppEnv } from "@shared/types/hono-env";
import { Hono } from "hono";
import { container } from "tsyringe";
import UsageService from "./usage.service";
import { getUsageQueryValidator } from "./usage.validator";

const usageRouter = new Hono<AppEnv>();

usageRouter.get("/health", async (c) => {
    return c.json({ message: "Usage API is working!" });
});

usageRouter.get("/", VineValidator("query", getUsageQueryValidator),
    async (c) => {
        const userId = c.get("userId")!;
        const query = c.req.valid("query");

        const usageService = container.resolve(UsageService);
        const usageLogs = await usageService.getUsageLogs({
            userId,
            projectId: query.projectId,
            apiKeyId: query.apiKeyId,
            metricCategory: query.metricCategory,
            metricName: query.metricName,
            page: query.page,
            limit: query.limit,
            from: query.from,
            to: query.to,
            sort: parseSortParam(query.sort),
            granularity: query.granularity,
            responseType: query.responseType,
        });

        return Response.success(c, { data: usageLogs });
    }
);

export default usageRouter;
