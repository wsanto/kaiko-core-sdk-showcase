import { ApiKeyUsageStat, MonthlyStats, ProjectMonthlyStats, ProjectUsageSummary } from "@shared/types/billing-client";
import dayjs from "dayjs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { Database, usageMonthlyStats, usersBilling } from "../../db";

@autoInjectable()
export default class BillingInternalService {
    constructor(
        @inject("DB") private database: Database,
        @inject("LOGGER") private logger: Logger
    ) { }

    async getMonthlyStats(userId: string, months: string[]): Promise<MonthlyStats[]> {
        if (months.length === 0) return [];
        const results = await this.database
            .select({
                month: usageMonthlyStats.month,
                totalCredits: sql<number>`COALESCE(SUM(${usageMonthlyStats.totalCredits}), 0)`,
                requests: sql<number>`COALESCE(SUM(${usageMonthlyStats.requests}), 0)`,
            })
            .from(usageMonthlyStats)
            .where(
                and(
                    eq(usageMonthlyStats.userId, userId),
                    inArray(usageMonthlyStats.month, months)
                )
            )
            .groupBy(usageMonthlyStats.month);

        const monthMap = new Map(
            months.map((m) => [m, { month: m, totalCredits: 0, requests: 0 }])
        );

        results.forEach((row) => {
            monthMap.set(row.month, {
                month: row.month,
                totalCredits: Number(row.totalCredits),
                requests: Number(row.requests),
            });
        });
        return Array.from(monthMap.values());
    }

    async getProjectUsage(userId: string, projectId: string, month?: string): Promise<ProjectMonthlyStats> {
        const monthlyMonthStr = month || dayjs().format("YYYY-MM");

        const totalRequestsQuery = this.database
            .select({ total: sql<number>`COALESCE(SUM(${usageMonthlyStats.requests}), 0)` })
            .from(usageMonthlyStats)
            .where(
                and(
                    eq(usageMonthlyStats.userId, userId),
                    eq(usageMonthlyStats.projectId, projectId)
                )
            );

        const monthlySpendQuery = this.database
            .select({ total: sql<number>`COALESCE(SUM(${usageMonthlyStats.totalCredits}), 0)` })
            .from(usageMonthlyStats)
            .where(
                and(
                    eq(usageMonthlyStats.userId, userId),
                    eq(usageMonthlyStats.projectId, projectId),
                    eq(usageMonthlyStats.month, monthlyMonthStr)
                )
            );

        const [totalRes, monthlyRes] = await Promise.all([totalRequestsQuery, monthlySpendQuery]);

        return {
            totalRequests: Number(totalRes[0]?.total || 0),
            monthlySpend: Number(monthlyRes[0]?.total || 0),
        };
    }

    async getProjectMonthlyStats(userId: string, projectId: string, months: string[]): Promise<MonthlyStats[]> {
        if (months.length === 0) return [];
        const results = await this.database
            .select({
                month: usageMonthlyStats.month,
                totalCredits: sql<number>`COALESCE(SUM(${usageMonthlyStats.totalCredits}), 0)`,
                requests: sql<number>`COALESCE(SUM(${usageMonthlyStats.requests}), 0)`,
            })
            .from(usageMonthlyStats)
            .where(
                and(
                    eq(usageMonthlyStats.userId, userId),
                    eq(usageMonthlyStats.projectId, projectId),
                    inArray(usageMonthlyStats.month, months)
                )
            )
            .groupBy(usageMonthlyStats.month);

        const monthMap = new Map(
            months.map((m) => [m, { month: m, totalCredits: 0, requests: 0 }])
        );

        results.forEach((row) => {
            monthMap.set(row.month, {
                month: row.month,
                totalCredits: Number(row.totalCredits),
                requests: Number(row.requests),
            });
        });
        return Array.from(monthMap.values());
    }

    async getApiKeyMonthlyStats(
        userId: string,
        projectId: string,
        months: string[]
    ): Promise<{ month: string; apiKeyId: string; requests: number; totalCredits: number }[]> {
        const results = await this.database
            .select({
                month: usageMonthlyStats.month,
                apiKeyId: usageMonthlyStats.apiKeyId,
                totalCredits: sql<number>`COALESCE(SUM(${usageMonthlyStats.totalCredits}), 0)`,
                requests: sql<number>`COALESCE(SUM(${usageMonthlyStats.requests}), 0)`,
            })
            .from(usageMonthlyStats)
            .where(
                and(
                    eq(usageMonthlyStats.userId, userId),
                    eq(usageMonthlyStats.projectId, projectId),
                    inArray(usageMonthlyStats.month, months)
                )
            )
            .groupBy(usageMonthlyStats.month, usageMonthlyStats.apiKeyId);

        return results.map((row) => ({
            month: row.month,
            apiKeyId: row.apiKeyId || "",
            requests: Number(row.requests),
            totalCredits: Number(row.totalCredits),
        }));
    }

    async getUserBilling(userId: string) {
        const result = await this.database
            .select()
            .from(usersBilling)
            .where(eq(usersBilling.userId, userId))
            .limit(1);

        if (result.length === 0) {
            return null;
        }

        const billing = result[0];
        return {
            userId: billing.userId,
            legacyBalance: Number(billing.legacyBalance),
            currentPersistentCreditAmount: Number(billing.currentPersistentCreditAmount),
            currentTemporaryCreditAmount: Number(billing.currentTemporaryCreditAmount),
            currentTemporaryCreditExpiredAt: billing.currentTemporaryCreditExpiredAt?.toISOString() || null,
            isInternal: billing.isInternal || false,
        };
    }

    async getProjectsUsageSummary(projectIds: string[]): Promise<ProjectUsageSummary[]> {
        if (!projectIds.length) return [];

        const currentMonth = dayjs().format("YYYY-MM");

        const result = await this.database
            .select({
                projectId: usageMonthlyStats.projectId,
                totalRequests: sql<number>`COALESCE(SUM(${usageMonthlyStats.requests}), 0)`,
                totalCredits: sql<number>`COALESCE(SUM(${usageMonthlyStats.totalCredits}), 0)`,
                apiKeyCount: sql<number>`COUNT(DISTINCT ${usageMonthlyStats.apiKeyId})`,
                lastUsedAt: sql<Date>`MAX(${usageMonthlyStats.updatedAt})`,
            })
            .from(usageMonthlyStats)
            .where(
                and(
                    inArray(usageMonthlyStats.projectId, projectIds),
                    eq(usageMonthlyStats.month, currentMonth)
                )
            )
            .groupBy(usageMonthlyStats.projectId);

        return result.map((row) => ({
            projectId: row.projectId,
            totalRequests: Number(row.totalRequests),
            totalCredits: Number(row.totalCredits),
            apiKeyCount: Number(row.apiKeyCount),
            lastUsedAt: row.lastUsedAt ? dayjs(row.lastUsedAt).format("YYYY-MM-DD") : null,
        }));
    }


    async getApiKeysUsage(apiKeyIds: string[]): Promise<ApiKeyUsageStat[]> {
        if (!apiKeyIds.length) return [];

        const currentMonth = dayjs().format("YYYY-MM");

        const result = await this.database
            .select({
                apiKeyId: usageMonthlyStats.apiKeyId,
                totalRequests: sql<number>`COALESCE(SUM(${usageMonthlyStats.requests}), 0)`,
                totalCredits: sql<number>`COALESCE(SUM(${usageMonthlyStats.totalCredits}), 0)`,
                lastUsedAt: sql<Date>`MAX(${usageMonthlyStats.updatedAt})`,
            })
            .from(usageMonthlyStats)
            .where(
                and(
                    inArray(usageMonthlyStats.apiKeyId, apiKeyIds),
                    eq(usageMonthlyStats.month, currentMonth)
                )
            )
            .groupBy(usageMonthlyStats.apiKeyId);

        return result.map((row) => ({
            apiKeyId: row.apiKeyId,
            totalRequests: Number(row.totalRequests),
            totalCredits: Number(row.totalCredits),
            lastUsedAt: row.lastUsedAt ? dayjs(row.lastUsedAt).format("YYYY-MM-DD") : null,
        }));
    }
}
