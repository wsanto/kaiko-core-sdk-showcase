import { Response } from "@shared/utils";
import { createMiddleware } from "hono/factory";
import { container } from "tsyringe";
import { AuthAdapterService, BillingAdapterService } from "../modules/adapters";

export const VerifyApiKeyAndBalanceMiddleware = () =>
    createMiddleware<{
        Variables: {
            userId?: string;
            apiKeyId?: string;
        };
    }>(async (c, next) => {
        const apiKeyId = c.get("apiKeyId");
        const userId = c.get("userId");

        const authAdapter = container.resolve(AuthAdapterService);
        const billingAdapter = container.resolve(BillingAdapterService);

        const status = await authAdapter.checkApiKeyStatus(apiKeyId!);

        if (status.isPaused) {
            return Response.error(c, {
                code: 403,
                message: `Access denied: ${status.reason}`,
            });
        }

        const userBilling = await billingAdapter.getUserBilling(userId!);

        console.log("User Billing Info:", userBilling);

        if (!userBilling) {
            return Response.error(c, {
                code: 403,
                message: "User billing account not found",
            });
        }

        // Internal users bypass all credit/balance checks
        if (userBilling.isInternal) {
            console.log(`Internal user ${userId} bypassing credit check`);
            await next();
            return;
        }

        const legacyBalance = userBilling.legacyBalance || 0;
        const persistentCredit = userBilling.currentPersistentCreditAmount || 0;
        const temporaryCredit = userBilling.currentTemporaryCreditAmount || 0;
        const temporaryCreditExpired =
            userBilling.currentTemporaryCreditExpiredAt &&
            new Date(userBilling.currentTemporaryCreditExpiredAt) < new Date();

        const availableCredit =
            legacyBalance + persistentCredit + (temporaryCreditExpired ? 0 : temporaryCredit);

        if (availableCredit <= 0) {
            return Response.error(c, {
                code: 402,
                message: "Insufficient credits. Please top up your account or subscribe to a plan.",
            });
        }

        await next();
    });
