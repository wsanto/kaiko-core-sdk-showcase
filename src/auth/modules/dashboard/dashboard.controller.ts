import { ParseGatewayDataMiddleware } from "@shared/middlewares";
import { Response, VineValidator } from "@shared/utils";
import { Hono } from "hono";
import { container } from "tsyringe";
import DashboardService from "./dashboard.service";
import { chartQueryValidator } from "./dashboard.validator";

const dashboardService = container.resolve(DashboardService);
const dashboardRouter = new Hono();

dashboardRouter.get(
  "/stats",
  ParseGatewayDataMiddleware(),
  async (c) => {
    const userId = c.get("userId")!;
    const stats = await dashboardService.getDashboardStats(userId);
    return Response.success(c, { data: stats });
  }
);

dashboardRouter.get(
  "/chart",
  ParseGatewayDataMiddleware(),
  VineValidator("query", chartQueryValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { months } = c.req.valid("query");
    const chartData = await dashboardService.getChartData(userId, months);
    return Response.success(c, { data: chartData });
  }
);

export default dashboardRouter;