import { omitKeys } from "@shared/utils";
import dayjs from "dayjs";
import { and, eq, getTableColumns, isNull, like, sql } from "drizzle-orm";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { apiKey as apiKeySchema, Database, project as projectSchema } from "../../db";
import { BillingAdapterService } from "../adapter";
import { ProjectUsageSummary } from "@shared/types/billing-client";
import { ApiKeyMonthlyUsage, ListProjectFilters, MonthlyUsage, ProjectStats, UserProjectStats } from "./types";

@autoInjectable()
export default class ProjectService {

  constructor(
    @inject("DB") private db: Database,
    @inject("LOGGER") private logger: Logger,
    @inject(BillingAdapterService) private billingAdapterService: BillingAdapterService

  ) { }

  projectColumnsWithoutSensitive = omitKeys(getTableColumns(projectSchema), ["systemConfig"]);
  apiKeyColumnsWithoutSensitive = omitKeys(getTableColumns(apiKeySchema), ["digest", "salt", "prefix", "last4"]);

  async isValidProject(userId: string, projectId: string) {
    const existing = await this.db
      .select({ id: projectSchema.id })
      .from(projectSchema)
      .where(and(eq(projectSchema.id, projectId), eq(projectSchema.userId, userId), isNull(projectSchema.deletedAt)));

    return existing.length > 0;
  }

  async create(userId: string, data: { name: string; isActive?: boolean; config?: any }) {
    const [newProject] = await this.db
      .insert(projectSchema)
      .values({
        userId,
        name: data.name,
        isActive: data.isActive ?? true,
        config: data.config ?? null,
      })
      .returning(this.projectColumnsWithoutSensitive);

    return newProject;
  }

  async update(userId: string, id: string, data: Partial<{ name: string; config?: any }>) {
    const [updated] = await this.db
      .update(projectSchema)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectSchema.id, id),
          eq(projectSchema.userId, userId),
          isNull(projectSchema.deletedAt)
        )
      )
      .returning(this.projectColumnsWithoutSensitive);

    return updated ?? null;
  }

  async delete(userId: string, id: string) {
    const [deleted] = await this.db
      .update(projectSchema)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(projectSchema.id, id),
          eq(projectSchema.userId, userId),
          isNull(projectSchema.deletedAt)
        )
      )
      .returning({ id: projectSchema.id });

    return deleted ?? null;
  }

  async getById(userId: string, id: string) {
    return await this.db.query.project.findFirst({
      where: and(
        eq(projectSchema.id, id),
        eq(projectSchema.userId, userId),
        isNull(projectSchema.deletedAt)
      ),
    });
  }

  async list(userId: string, filters: ListProjectFilters = {}) {
    const conditions: any[] = [
      isNull(projectSchema.deletedAt),
      eq(projectSchema.userId, userId),
    ];

    if (filters.name) {
      conditions.push(like(projectSchema.name, `%${filters.name}%`));
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(projectSchema.isActive, filters.isActive));
    }

    const apiKeyFields = Object.entries(this.apiKeyColumnsWithoutSensitive)
      .map(([key, col]) => `'${key}', "api_keys"."${col.name}"`)
      .join(", ");

    const projects = await this.db
      .select({
        ...this.projectColumnsWithoutSensitive,
        apiKeys: sql`
        COALESCE(
          json_agg(
            json_build_object(${sql.raw(apiKeyFields)})
          ) FILTER (WHERE ${apiKeySchema.id} IS NOT NULL),
          '[]'::json
        )
      `.as("api_keys"),
      })
      .from(projectSchema)
      .leftJoin(
        apiKeySchema,
        and(
          eq(apiKeySchema.projectId, projectSchema.id),
          isNull(apiKeySchema.deletedAt)
        )
      )
      .where(and(...conditions))
      .groupBy(projectSchema.id);

    const projectIds = projects.map((p) => p.id);

    let usageSummaries: ProjectUsageSummary[] = [];
    try {
      usageSummaries = await this.billingAdapterService.getProjectsUsageSummary(projectIds);
    } catch (error) {
      this.logger.error('Failed to fetch project usage summaries, returning projects without usage data:', {
        projectIds,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const usageMap = new Map(
      usageSummaries.map((usage) => [usage.projectId, usage])
    );

    const result = projects.map((project) => {
      const usage = usageMap.get(project.id);
      return {
        ...project,
        usage: usage
          ? {
            totalRequests: usage.totalRequests,
            totalCredits: usage.totalCredits,
            apiKeyCount: usage.apiKeyCount,
            lastUsedAt: usage.lastUsedAt,
          }
          : {
            totalRequests: 0,
            totalCredits: 0,
            apiKeyCount: 0,
            lastUsedAt: null,
          },
      };
    });

    return result;
  }


  async pause(projectId: string) {
    const [updated] = await this.db
      .update(projectSchema)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(projectSchema.id, projectId), isNull(projectSchema.deletedAt)))
      .returning(this.projectColumnsWithoutSensitive);

    return updated ?? null;
  }

  async resume(projectId: string) {
    const [updated] = await this.db
      .update(projectSchema)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(projectSchema.id, projectId), isNull(projectSchema.deletedAt)))
      .returning(this.projectColumnsWithoutSensitive);

    return updated ?? null;
  }

  async getProjectStats(projectId: string): Promise<ProjectStats> {
    const activeApiKeysQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiKeySchema)
      .where(
        and(
          eq(apiKeySchema.projectId, projectId),
          eq(apiKeySchema.isActive, true),
          isNull(apiKeySchema.deletedAt)
        )
      );

    const projectQuery = this.db
      .select({
        createdAt: projectSchema.createdAt,
        name: projectSchema.name,
        userId: projectSchema.userId
      })
      .from(projectSchema)
      .where(
        and(
          eq(projectSchema.id, projectId),
          isNull(projectSchema.deletedAt)
        )
      )
      .limit(1);

    const [activeApiKeysResult, projectResult] = await Promise.all([
      activeApiKeysQuery,
      projectQuery
    ]);

    const activeApiKeys = activeApiKeysResult[0]?.count || 0;
    const project = projectResult[0];

    const createdDate = project?.createdAt
      ? dayjs(project.createdAt).format("MMM D, YYYY")
      : dayjs().format("MMM D, YYYY");

    let totalRequests = 0;
    let monthlySpend = 0;

    if (project?.userId) {
      try {
        const projectUsage = await this.billingAdapterService.getProjectUsage(project.userId, projectId);
        totalRequests = projectUsage.totalRequests;
        monthlySpend = projectUsage.monthlySpend;
      } catch (error) {
        this.logger.error('Failed to fetch project usage:', {
          userId: project.userId,
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      activeApiKeys,
      totalRequests,
      monthlySpend,
      createdDate
    };
  }

  async userProjectStats(userId: string): Promise<UserProjectStats> {
    const totalProjectsQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(projectSchema)
      .where(and(eq(projectSchema.userId, userId), isNull(projectSchema.deletedAt)));

    const activeProjectsQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(projectSchema)
      .where(and(eq(projectSchema.userId, userId), eq(projectSchema.isActive, true), isNull(projectSchema.deletedAt)));

    const totalApiKeysQuery = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(apiKeySchema)
      .innerJoin(projectSchema, eq(apiKeySchema.projectId, projectSchema.id))
      .where(and(eq(projectSchema.userId, userId), isNull(apiKeySchema.deletedAt), isNull(projectSchema.deletedAt)));

    const currentMonthStr = dayjs().format('YYYY-MM');

    const [totalProjectsResult, activeProjectsResult, totalApiKeysResult] = await Promise.all([
      totalProjectsQuery,
      activeProjectsQuery,
      totalApiKeysQuery
    ]);

    const totalProjects = totalProjectsResult[0]?.count || 0;
    const activeProjects = activeProjectsResult[0]?.count || 0;
    const totalApiKeys = totalApiKeysResult[0]?.count || 0;

    let monthlyRequests = 0;
    try {
      const monthlyStats = await this.billingAdapterService.getMonthlyStats(userId, [currentMonthStr]);
      monthlyRequests = monthlyStats[0]?.requests || 0;
    } catch (error) {
      this.logger.error('Failed to fetch monthly stats for user project stats:', {
        userId,
        month: currentMonthStr,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      totalProjects,
      activeProjects,
      totalApiKeys,
      monthlyRequests,
    };
  }

  async getChartStats(projectId: string, type: 'total' | 'apiKey', months: number = 6): Promise<MonthlyUsage[] | ApiKeyMonthlyUsage[]> {
    const project = await this.db
      .select({ userId: projectSchema.userId })
      .from(projectSchema)
      .where(and(eq(projectSchema.id, projectId), isNull(projectSchema.deletedAt)))
      .limit(1);

    const userId = project[0]?.userId;

    if (!userId) {
      throw new Error("Project not found or invalid");
    }

    const now = dayjs();
    const endDate = now.endOf('month');
    const startDate = now.subtract(months - 1, 'month').startOf('month');

    const monthStrings: string[] = [];
    let currentMonth = startDate.clone();

    while (currentMonth.isBefore(endDate) || currentMonth.isSame(endDate, 'month')) {
      monthStrings.push(currentMonth.format('YYYY-MM'));
      currentMonth = currentMonth.add(1, 'month');
    }
    if (type === 'total') {
      const monthlyStats = await this.billingAdapterService.getProjectMonthlyStats(userId, projectId, monthStrings);

      const statsMap = new Map(monthlyStats.map(s => [s.month, s]));

      return monthStrings.map(monthStr => {
        const stats = statsMap.get(monthStr) || { month: monthStr, totalCredits: 0, requests: 0 };
        const monthDayjs = dayjs(`${monthStr}-01`);
        return {
          monthName: monthDayjs.format('MMM'),
          requests: stats.requests,
          spend: stats.totalCredits,
        };
      });
    }

    if (type === 'apiKey') {
      const apiKeys = await this.db
        .select({
          id: apiKeySchema.id,
          name: apiKeySchema.name,
        })
        .from(apiKeySchema)
        .where(and(eq(apiKeySchema.projectId, projectId), isNull(apiKeySchema.deletedAt)));

      if (apiKeys.length === 0) {
        return [];
      }

      const apiKeyStats = await this.billingAdapterService.getApiKeyMonthlyStats(userId, projectId, monthStrings);

      const statsByMonth = new Map<string, Map<string, { requests: number; spend: number }>>();

      for (const stat of apiKeyStats) {
        if (!statsByMonth.has(stat.month)) {
          statsByMonth.set(stat.month, new Map());
        }
        statsByMonth.get(stat.month)!.set(stat.apiKeyId, {
          requests: stat.requests,
          spend: stat.totalCredits,
        });
      }

      return monthStrings.map(monthStr => {
        const monthData = statsByMonth.get(monthStr) || new Map();
        const monthDayjs = dayjs(`${monthStr}-01`);

        const apiKeysForMonth = apiKeys.map(apiKey => ({
          name: apiKey.name || "Unknown",
          stats: monthData.get(apiKey.id) || { requests: 0, spend: 0 },
        }));

        return {
          monthName: monthDayjs.format('MMM'),
          apiKeys: apiKeysForMonth,
        };
      });
    }
    return []
  }
}
