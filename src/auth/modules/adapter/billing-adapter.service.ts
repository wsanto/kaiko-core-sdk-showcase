import { ApiKeyStats, ApiKeyUsageStat, MonthlyStats, ProjectMonthlyStats, ProjectUsageSummary } from "@shared/types/billing-client";
import { BaseApiClient } from "@shared/services/base-api-client";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";

export { ApiClientError as BillingApiError } from "@shared/services/base-api-client";

@autoInjectable()
export default class BillingAdapterService extends BaseApiClient {
    constructor(@inject("LOGGER") logger: Logger) {
        super(logger, undefined, "billing/internal/");
    }

    protected getDefaultBaseUrl(): string {
        return process.env.BILLING_API_BASE_URL || "http://127.0.0.1:3001/dev/v1";
    }

    async getMonthlyStats(userId: string, months: string[]): Promise<MonthlyStats[]> {
        if (!userId) throw new Error("User ID is required");
        if (!months?.length) return [];

        const result = await this.callApi<MonthlyStats[]>("monthly-stats", {
            method: "POST",
            body: JSON.stringify({ userId, months }),
        });

        return result || [];
    }

    async getProjectUsage(userId: string, projectId: string, month?: string): Promise<ProjectMonthlyStats> {
        if (!userId) throw new Error("User ID is required");
        if (!projectId) throw new Error("Project ID is required");

        const result = await this.callApi<ProjectMonthlyStats>("project-usage", {
            method: "POST",
            body: JSON.stringify({ userId, projectId, month }),
        });

        return result || { totalRequests: 0, monthlySpend: 0 };
    }

    async getProjectMonthlyStats(userId: string, projectId: string, months: string[]): Promise<MonthlyStats[]> {
        if (!userId) throw new Error("User ID is required");
        if (!projectId) throw new Error("Project ID is required");
        if (!months?.length) return [];

        const result = await this.callApi<MonthlyStats[]>("project-monthly-stats", {
            method: "POST",
            body: JSON.stringify({ userId, projectId, months }),
        });

        return result || [];
    }

    async getApiKeyMonthlyStats(userId: string, projectId: string, months: string[]): Promise<ApiKeyStats[]> {
        if (!userId) throw new Error("User ID is required");
        if (!projectId) throw new Error("Project ID is required");
        if (!months?.length) return [];

        const result = await this.callApi<ApiKeyStats[]>("api-key-monthly-stats", {
            method: "POST",
            body: JSON.stringify({ userId, projectId, months }),
        });

        return result || [];
    }

    async getApiKeysUsage(apiKeyIds: string[]): Promise<ApiKeyUsageStat[]> {
        if (!apiKeyIds?.length) return [];

        const result = await this.callApi<ApiKeyUsageStat[]>("api-keys-usage", {
            method: "POST",
            body: JSON.stringify({ apiKeyIds }),
        });

        return result || [];
    }

    async getProjectsUsageSummary(projectIds: string[]): Promise<ProjectUsageSummary[]> {
        if (!projectIds?.length) return [];

        const result = await this.callApi<ProjectUsageSummary[]>("projects-usage", {
            method: "POST",
            body: JSON.stringify({ projectIds }),
        });

        return result || [];
    }
}
