import { Response, VineValidator } from "@shared/utils";
import type { AppEnv } from "@shared/types/hono-env";
import { Hono } from "hono";
import { container } from "tsyringe";
import BillingService from "./billing.service";
import { topUpValidator } from "./billing.validator";

const billingRouter = new Hono<AppEnv>();
const billingService = container.resolve(BillingService);

billingRouter.post(
    "/topups",
    VineValidator("json", topUpValidator),
    async (c) => {
        const userId = c.get("userId")!;
        const { amount, paymentMethodId } = c.req.valid("json");

        try {
            const topUpResult = await billingService.topUp(userId, amount, paymentMethodId);
            return Response.success(c, { data: topUpResult });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("default payment method")) {
                return Response.error(c, { message });
            }
            return Response.error(c, { message });
        }
    }
);

billingRouter.get(
    "/persistent-credit",
    async (c) => {
        const userId = c.get("userId")!;
        const creditResult = await billingService.getUserPersistentCredit(userId);
        return Response.success(c, { data: creditResult });
    }
);
billingRouter.get(
    "/temporary-credit",
    async (c) => {
        const userId = c.get("userId")!;
        const creditResult = await billingService.getTemporaryCreditInfo(userId);
        return Response.success(c, { data: creditResult });
    }
);

billingRouter.get(
    "/current",
    async (c) => {
        const userId = c.get("userId")!;
        const result = await billingService.getCurrentBillingAndStatsBillingInfo(userId);
        return Response.success(c, { data: result });
    });
export default billingRouter;
