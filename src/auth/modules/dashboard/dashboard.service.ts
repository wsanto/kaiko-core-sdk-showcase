import { MonthlyStats } from "@shared/types/billing-client";
import dayjs from "dayjs";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { apiKey as apiKeySchema, Database, project as projectSchema } from "../../db";
import { BillingAdapterService } from "../adapter";
import { ChartDataPoint, DashboardStats } from "./types";

@autoInjectable()
export default class DashboardService {
  constructor(
    @inject("DB") private db: Database,
    @inject("LOGGER") private logger: Logger,
    @inject(BillingAdapterService) private billingAdapterService: BillingAdapterService
  ) { }

  private calculateChange(current: number, previous: number): string {
    const difference = current - previous;
    if (difference > 0) {
      return `+${difference}`;
    }
    if (difference < 0) {
      return `${difference}`;
    }
    return "+0";
  }

  async getDashboardStats(userId: string): Promise<DashboardStats> {
    const now = dayjs();
    const startOfCurrentMonth = now.startOf('month').toDate();
    const endOfCurrentMonth = now.endOf('month').toDate();
    const startOfLastMonth = now.subtract(1, 'month').startOf('month').toDate();
    const endOfLastMonth = now.subtract(1, 'month').endOf('month').toDate();

    const totalProjectsQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(projectSchema)
      .where(
        and(
          eq(projectSchema.userId, userId),
          isNull(projectSchema.deletedAt)
        )
      );

    const currentMonthProjectsQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(projectSchema)
      .where(
        and(
          eq(projectSchema.userId, userId),
          isNull(projectSchema.deletedAt),
          gte(projectSchema.createdAt, startOfCurrentMonth),
          lte(projectSchema.createdAt, endOfCurrentMonth)
        )
      );

    const lastMonthProjectsQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(projectSchema)
      .where(
        and(
          eq(projectSchema.userId, userId),
          isNull(projectSchema.deletedAt),
          gte(projectSchema.createdAt, startOfLastMonth),
          lte(projectSchema.createdAt, endOfLastMonth)
        )
      );

    const totalActiveApiKeysQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiKeySchema)
      .innerJoin(projectSchema, eq(apiKeySchema.projectId, projectSchema.id))
      .where(
        and(
          eq(projectSchema.userId, userId),
          eq(apiKeySchema.isActive, true),
          isNull(apiKeySchema.deletedAt),
          isNull(projectSchema.deletedAt)
        )
      );

    const currentMonthApiKeysQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiKeySchema)
      .innerJoin(projectSchema, eq(apiKeySchema.projectId, projectSchema.id))
      .where(
        and(
          eq(projectSchema.userId, userId),
          isNull(apiKeySchema.deletedAt),
          isNull(projectSchema.deletedAt),
          gte(apiKeySchema.createdAt, startOfCurrentMonth),
          lte(apiKeySchema.createdAt, endOfCurrentMonth)
        )
      );

    const lastMonthApiKeysQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiKeySchema)
      .innerJoin(projectSchema, eq(apiKeySchema.projectId, projectSchema.id))
      .where(
        and(
          eq(projectSchema.userId, userId),
          isNull(apiKeySchema.deletedAt),
          isNull(projectSchema.deletedAt),
          gte(apiKeySchema.createdAt, startOfLastMonth),
          lte(apiKeySchema.createdAt, endOfLastMonth)
        )
      );

    const [
      totalProjectsCountResult,
      currentMonthProjectsResult,
      lastMonthProjectsResult,
      totalActiveApiKeysResult,
      currentMonthApiKeysResult,
      lastMonthApiKeysResult
    ] = await Promise.all([
      totalProjectsQuery,
      currentMonthProjectsQuery,
      lastMonthProjectsQuery,
      totalActiveApiKeysQuery,
      currentMonthApiKeysQuery,
      lastMonthApiKeysQuery
    ]);

    const totalProjects = totalProjectsCountResult[0]?.count || 0;
    const currentMonthProjects = currentMonthProjectsResult[0]?.count || 0;
    const lastMonthProjects = lastMonthProjectsResult[0]?.count || 0;
    const totalActiveApiKeys = totalActiveApiKeysResult[0]?.count || 0;
    const currentMonthApiKeys = currentMonthApiKeysResult[0]?.count || 0;
    const lastMonthApiKeys = lastMonthApiKeysResult[0]?.count || 0;

    const projectsChange = this.calculateChange(currentMonthProjects, lastMonthProjects);
    const apiKeysChange = this.calculateChange(currentMonthApiKeys, lastMonthApiKeys);

    const currentMonthStr = now.format('YYYY-MM');
    const lastMonthStr = now.subtract(1, 'month').format('YYYY-MM');

    let monthlyStats: MonthlyStats[] = [];
    try {
      monthlyStats = await this.billingAdapterService.getMonthlyStats(userId, [currentMonthStr, lastMonthStr]);
    } catch (error) {
      this.logger.error('Failed to fetch monthly stats for dashboard:', {
        userId,
        months: [currentMonthStr, lastMonthStr],
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const currentStats = monthlyStats.find(s => s.month === currentMonthStr) || { month: currentMonthStr, totalCredits: 0, requests: 0 };
    const lastStats = monthlyStats.find(s => s.month === lastMonthStr) || { month: lastMonthStr, totalCredits: 0, requests: 0 };

    const currentSpend = currentStats.totalCredits;
    const lastSpend = lastStats.totalCredits;
    const monthlySpendChange = this.calculateChange(currentSpend, lastSpend);

    const currentRequests = currentStats.requests;
    const lastRequests = lastStats.requests;
    const apiRequestsChange = this.calculateChange(currentRequests, lastRequests);

    return {
      activeApiKeys: {
        value: totalActiveApiKeys,
        change: apiKeysChange,
      },
      projects: {
        value: totalProjects,
        change: projectsChange,
      },
      monthlySpend: {
        value: currentSpend,
        change: monthlySpendChange,
      },
      apiRequests: {
        value: currentRequests,
        change: apiRequestsChange,
      },
    };
  }

  async getChartData(userId: string, months: number = 6): Promise<ChartDataPoint[]> {
    const now = dayjs();
    const endDate = now.endOf('month');
    const startDate = now.subtract(months - 1, 'month').startOf('month');

    const monthStrings: string[] = [];
    let currentMonth = startDate.clone();

    while (currentMonth.isBefore(endDate) || currentMonth.isSame(endDate, 'month')) {
      monthStrings.push(currentMonth.format('YYYY-MM'));
      currentMonth = currentMonth.add(1, 'month');
    }

    try {
      const monthlyStats: MonthlyStats[] = await this.billingAdapterService.getMonthlyStats(userId, monthStrings);

      const statsMap = new Map(monthlyStats.map(s => [s.month, s]));

      return monthStrings.map(monthStr => {
        const stats = statsMap.get(monthStr) || { month: monthStr, totalCredits: 0, requests: 0 };
        const monthDayjs = dayjs(`${monthStr}-01`);
        return {
          monthName: monthDayjs.format('MMM'),
          requests: stats.requests,
          tokenUsed: stats.totalCredits,
        };
      });
    } catch (error) {
      this.logger.error('Error fetching chart data:', {
        userId,
        months: monthStrings,
        error: error instanceof Error ? error.message : error,
      });
      return monthStrings.map(monthStr => {
        const monthDayjs = dayjs(`${monthStr}-01`);
        return {
          monthName: monthDayjs.format('MMM'),
          requests: 0,
          tokenUsed: 0,
        };
      });
    }
  }
}