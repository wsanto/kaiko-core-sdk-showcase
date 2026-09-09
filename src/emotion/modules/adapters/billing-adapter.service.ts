import { BaseApiClient, ApiClientError } from "@shared/services/base-api-client";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";

export { ApiClientError as BillingApiError };

export interface UserBillingResponse {
    userId: string;
    stripeCustomerId: string | null;
    legacyBalance: number;
    currentPersistentCreditAmount: number;
    currentTemporaryCreditAmount: number;
    currentTemporaryCreditExpiredAt: string | null;
    lastStripeSyncAt: string | null;
    isInternal: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}

@autoInjectable()
export default class BillingAdapterService extends BaseApiClient {
    constructor(@inject("LOGGER") logger: Logger) {
        super(logger, undefined, "");
    }

    protected getDefaultBaseUrl(): string {
        return process.env.BILLING_API_BASE_URL || "http://127.0.0.1:3001/dev/v1";
    }

    async getUserBilling(userId: string): Promise<UserBillingResponse | null> {
        if (!userId) throw new Error("User ID is required");

        try {
            return await this.callApi<UserBillingResponse>(`billing/internal/users/${userId}/balance`, {
                method: "GET",
            });
        } catch (error) {
            if (error instanceof ApiClientError && error.status === 404) {
                return null;
            }
            throw error;
        }
    }
}
