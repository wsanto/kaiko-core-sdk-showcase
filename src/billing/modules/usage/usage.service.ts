import { MetricCategory } from "@shared/constants";
import { getCredits } from "@shared/helpers/usage_log";
import { buildPaginationMeta, getPagination } from "@shared/utils/query/pagination";
import { SortParam } from "@shared/utils/query/sort";
import dayjs from "dayjs";
import { and, asc, desc, eq, gte, lte, sql, SQL } from "drizzle-orm";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { Database, usageLogs, usageMonthlyStats, usersBilling } from "../../db";
import { BillingService } from "../billing";
import { MonthlyStatsGroup, UsageLogBody, UsageLogInsert } from "./types";



@autoInjectable()
export default class UsageService {
  constructor(
    @inject("DB") private database: Database,
    @inject("LOGGER") private logger: Logger,
    @inject(BillingService) private billingService: BillingService
  ) { }

  async createUsageLogs(logs: UsageLogBody[]): Promise<void> {
    const dbRecords = this.transformLogsToDbRecords(logs);

    await this.database.transaction(async (tx) => {
      await this.insertUsageLogs(tx, dbRecords);
      await this.processMonthlyStatsAndCredits(tx, dbRecords);
    });
  }

  private transformLogsToDbRecords(logs: UsageLogBody[]): UsageLogInsert[] {
    return logs.map((log) => ({
      requestId: log.requestId,
      userId: log.userId,
      apiKeyId: log.apiKeyId,
      projectId: log.projectId,
      timestamp: dayjs.unix(log.timestamp).toDate(),
      metricCategory: log.metricCategory,
      metricName: log.metricName,
      value: log.value,
      metadata: log.metadata,
      creditUsed: Number(
        getCredits(log.metricCategory as MetricCategory, log.metricName, Number(log.value))
      ).toFixed(6),
    }));
  }

  private async insertUsageLogs(tx: any, dbRecords: UsageLogInsert[]): Promise<void> {
    await tx.insert(usageLogs).values(dbRecords);
  }

  private async processMonthlyStatsAndCredits(
    tx: any,
    logs: UsageLogInsert[]
  ): Promise<void> {
    const groupedStats = this.groupLogsByMonth(logs);
    await this.updateMonthlyStatsWithTx(tx, groupedStats);
    await this.deductCreditsForGroups(tx, groupedStats);

    this.logger.info(`[UsageService] Updated monthly stats for ${groupedStats.length} groups and deducted credits`);
  }

  private groupLogsByMonth(logs: UsageLogInsert[]): MonthlyStatsGroup[] {
    const grouped = new Map<string, MonthlyStatsGroup>();

    for (const log of logs) {
      const month = dayjs(log.timestamp).format("YYYY-MM");
      const key = `${log.userId}-${log.apiKeyId}-${log.projectId}-${month}`;
      const credit = Number(log.creditUsed || 0);

      if (!grouped.has(key)) {
        grouped.set(key, {
          userId: log.userId,
          apiKeyId: log.apiKeyId,
          projectId: log.projectId,
          month,
          requests: 1,
          totalCredits: credit,
        });
      } else {
        const g = grouped.get(key)!;
        g.requests += 1;
        g.totalCredits += credit;
      }
    }

    return Array.from(grouped.values());
  }

  private async updateMonthlyStatsWithTx(
    tx: any,
    groups: MonthlyStatsGroup[]
  ): Promise<void> {
    for (const record of groups) {
      await tx
        .insert(usageMonthlyStats)
        .values({
          userId: record.userId,
          apiKeyId: record.apiKeyId,
          projectId: record.projectId,
          month: record.month,
          requests: record.requests,
          totalCredits: record.totalCredits.toFixed(6),
        })
        .onConflictDoUpdate({
          target: [
            usageMonthlyStats.userId,
            usageMonthlyStats.apiKeyId,
            usageMonthlyStats.projectId,
            usageMonthlyStats.month,
          ],
          set: {
            requests: sql`${usageMonthlyStats.requests} + ${record.requests}`,
            totalCredits: sql`${usageMonthlyStats.totalCredits} + ${record.totalCredits}`,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  private async deductCreditsForGroups(
    tx: any,
    groups: MonthlyStatsGroup[]
  ): Promise<void> {
    for (const group of groups) {
      await this.deductCreditsWithTx(tx, group.userId, group.totalCredits);
    }
  }

  private async deductCreditsWithTx(tx: any, userId: string, credits: number): Promise<void> {
    if (credits <= 0) return;

    const userBilling = await this.getUserBillingInfo(tx, userId);
    if (!userBilling) {
      this.logger.warn(`[UsageService] No billing info found for user ${userId}`);
      return;
    }

    const { remainingCredits } = await this.deductFromTemporaryCredits(tx, userId, credits, userBilling);
    await this.deductFromPersistentCredits(tx, userId, remainingCredits, userBilling);
  }

  private async getUserBillingInfo(tx: any, userId: string) {
    const [userBilling] = await tx
      .select({
        currentTemporaryCreditAmount: usersBilling.currentTemporaryCreditAmount,
        currentPersistentCreditAmount: usersBilling.currentPersistentCreditAmount,
      })
      .from(usersBilling)
      .where(eq(usersBilling.userId, userId))
      .limit(1);

    return userBilling;
  }

  private async deductFromTemporaryCredits(
    tx: any,
    userId: string,
    credits: number,
    userBilling: any
  ): Promise<{ remainingCredits: number }> {
    let remaining = credits;
    const temp = Number(userBilling.currentTemporaryCreditAmount || 0);

    if (temp > 0) {
      const usedTemp = Number(Math.min(temp, remaining).toFixed(6));
      await this.billingService.subtractTemporaryCreditFromUserWithTx(tx, userId, usedTemp, "usage deduction");
      remaining -= usedTemp;
    }

    return { remainingCredits: remaining };
  }

  private async deductFromPersistentCredits(
    tx: any,
    userId: string,
    credits: number,
    userBilling: any
  ): Promise<void> {
    if (credits <= 0) return;

    const pers = Number(userBilling.currentPersistentCreditAmount || 0);

    if (pers > 0) {
      const usedPers = Number(Math.min(pers, credits).toFixed(6));
      await this.billingService.subtractPersistentCreditFromUserWithTx(tx, userId, usedPers, "usage deduction");
      credits -= usedPers;
    }

    if (credits > 0) {
      this.logger.warn(`[UsageService] User ${userId} has insufficient credits (missing ${credits})`);
    }
  }

  async getUsageLogs(params: {
    userId: string;
    projectId?: string;
    metricCategory?: string;
    metricName?: string;
    sort?: SortParam[];
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    granularity?: "daily" | "monthly" | "yearly";
    responseType?: "list" | "total";
    apiKeyId?: string;
  }) {
    const {
      userId,
      projectId,
      metricCategory,
      metricName,
      sort = [{ field: "timestamp", direction: "desc" }],
      page = 1,
      limit = 20,
      from,
      to,
      granularity,
      responseType = "list",
      apiKeyId
    } = params;

    const { offset } = getPagination({ page, limit });

    const conditions: (SQL | undefined)[] = [
      eq(usageLogs.userId, userId),
      projectId ? eq(usageLogs.projectId, projectId) : undefined,
      from ? gte(usageLogs.timestamp, new Date(from)) : undefined,
      to ? lte(usageLogs.timestamp, new Date(to)) : undefined,
      metricCategory ? eq(usageLogs.metricCategory, metricCategory) : undefined,
      metricName ? eq(usageLogs.metricName, metricName) : undefined,
      apiKeyId ? eq(usageLogs.apiKeyId, apiKeyId) : undefined,
    ];
    const whereCondition: SQL = and(...conditions.filter(Boolean)) ?? sql`true`;

    if (responseType === "list") {
      return this.getUsageLogsList({ whereCondition, sort, page, limit, offset });
    }

    if (responseType === "total") {
      return this.getUsageLogsTotal({ whereCondition, granularity, page, limit, offset });
    }
  }

  private async getUsageLogsList({
    whereCondition,
    sort,
    page,
    limit,
    offset,
  }: {
    whereCondition: SQL;
    sort: SortParam[];
    page: number;
    limit: number;
    offset: number;
  }) {
    const sortableFields: Record<string, any> = {
      id: usageLogs.id,
      userId: usageLogs.userId,
      apiKeyId: usageLogs.apiKeyId,
      requestId: usageLogs.requestId,
      projectId: usageLogs.projectId,
      timestamp: usageLogs.timestamp,
      metricCategory: usageLogs.metricCategory,
      metricName: usageLogs.metricName,
      value: usageLogs.value,
    };
    const sortExpr = sort.map((s) => {
      const col = sortableFields[s.field];
      if (!col) return desc(usageLogs.timestamp);
      return s.direction === "asc" ? asc(col) : desc(col);
    });

    const rows = await this.database
      .select({
        id: usageLogs.id,
        userId: usageLogs.userId,
        apiKeyId: usageLogs.apiKeyId,
        requestId: usageLogs.requestId,
        projectId: usageLogs.projectId,
        timestamp: usageLogs.timestamp,
        metricCategory: usageLogs.metricCategory,
        metricName: usageLogs.metricName,
        value: usageLogs.value,
        creditUsed: usageLogs.creditUsed,
        metadata: usageLogs.metadata,
      })
      .from(usageLogs)
      .where(whereCondition)
      .orderBy(...sortExpr)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.database
      .select({ count: sql<number>`COUNT(*)` })
      .from(usageLogs)
      .where(whereCondition);

    return {
      data: rows,
      pagination: buildPaginationMeta(Number(count), page, limit),
    };
  }

  private async getUsageLogsTotal({
    whereCondition,
    granularity,
    page,
    limit,
    offset,
  }: {
    whereCondition: SQL;
    granularity?: "daily" | "monthly" | "yearly";
    page: number;
    limit: number;
    offset: number;
  }) {
    let dateTruncExpr: SQL;
    switch (granularity) {
      case "daily":
        dateTruncExpr = sql`DATE_TRUNC('day', ${usageLogs.timestamp})::date`;
        break;
      case "monthly":
        dateTruncExpr = sql`DATE_TRUNC('month', ${usageLogs.timestamp})::date`;
        break;
      case "yearly":
        dateTruncExpr = sql`DATE_TRUNC('year', ${usageLogs.timestamp})::date`;
        break;
      default:
        dateTruncExpr = sql`DATE_TRUNC('day', ${usageLogs.timestamp})::date`;
    }

    const rows = await this.database
      .select({
        period: dateTruncExpr,
        totalTokens: sql<number>`COALESCE(SUM(${usageLogs.value}::numeric), 0)`,
        totalRequests: sql<number>`COUNT(*)`,
      })
      .from(usageLogs)
      .where(whereCondition)
      .groupBy(dateTruncExpr)
      .orderBy(asc(dateTruncExpr))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.database
      .select({ count: sql<number>`COUNT(DISTINCT ${dateTruncExpr})` })
      .from(usageLogs)
      .where(whereCondition);

    return {
      data: rows,
      pagination: buildPaginationMeta(Number(count), page, limit),
    };
  }
}
