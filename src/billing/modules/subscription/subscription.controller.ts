import { Response, VineValidator } from "@shared/utils";
import type { AppEnv } from "@shared/types/hono-env";
import { Hono } from "hono";
import { container } from "tsyringe";
import SubscriptionService from "./subscription.service";
import { createSubscriptionValidator } from "./subscription.validator";

const subscriptionRouter = new Hono<AppEnv>();
const subscriptionService = container.resolve(SubscriptionService);

subscriptionRouter.post("/", VineValidator("json", createSubscriptionValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const subscriptionData = c.req.valid("json");

    const subscription = await subscriptionService.createSubscription(userId, subscriptionData);
    return Response.success(c, { data: subscription });
  }
);

subscriptionRouter.get("/current", async (c) => {
  const userId = c.get("userId")!;

  const subscription = await subscriptionService.getCurrentUserSubscription(userId);
  return Response.success(c, { data: subscription });
});

subscriptionRouter.delete("/:subscriptionId/cancel-later", async (c) => {
  const subscriptionId = c.req.param("subscriptionId");
  await subscriptionService.cancelSubscriptionAtPeriodEnd(subscriptionId);

  return Response.success(c, {});
});

subscriptionRouter.delete("/:subscriptionId/cancel-now", async (c) => {
  const subscriptionId = c.req.param("subscriptionId");
  await subscriptionService.cancelSubscriptionImmediately(subscriptionId);

  return Response.success(c, {});
});

subscriptionRouter.get("/plans", async (c) => {
  const userId = c.get("userId")!;

  const plans = await subscriptionService.getAllPlans(userId);
  return Response.success(c, { data: plans });
});

export default subscriptionRouter;