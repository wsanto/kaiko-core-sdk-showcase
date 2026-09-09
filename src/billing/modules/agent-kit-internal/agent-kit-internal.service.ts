import { AGENT_KIT_PER_USER_CREDITS, MetricCategory } from "@shared/constants";
import { getCredits } from "@shared/helpers/usage_log";
import dayjs from "dayjs";
import { and, eq, sql } from "drizzle-orm";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { Database, usageLogs, usageMonthlyStats, usersBilling } from "../../db";
import { BillingService } from "../billing";
import {
  LogUsageRequest,
  RegisterEndUserRequest,
  RegisterEndUserResponse,
  VerifyApiKeyResponse,
} from "./types";

@autoInjectable()
export default class AgentKitInternalService {
  constructor(
    @inject("DB") private database: Database,
    @inject("LOGGER") private logger: Logger,
    @inject(BillingService) private billingService: BillingService
  ) {}

  /**
   * Verify an API key and return associated metadata
   * Used by Agent Kit backend to validate incoming requests
   */
  async verifyApiKey(apiKey: string): Promise<VerifyApiKeyResponse> {
    try {
      // Import auth DB to access API key tables
      const { createDB: createAuthDB } = await import("../../../auth/db");
      const authDb = createAuthDB();

      // Parse the API key to get prefix and last4
      const keyWithoutPrefix = apiKey.replace(/^sk_(prod|stg|dev)_/, "");
      const prefix = keyWithoutPrefix.slice(0, 10);
      const last4 = keyWithoutPrefix.slice(-4);

      // Query for the API key
      const result = await authDb.execute(sql`
        SELECT
          ak.id as api_key_id,
          ak.project_id,
          ak.key_type_id,
          ak.is_active as key_is_active,
          ak.digest,
          ak.salt,
          p.user_id,
          p.name as project_name,
          p.is_active as project_is_active,
          COALESCE(p.is_internal, false) as is_internal
        FROM api_keys ak
        JOIN projects p ON ak.project_id = p.id
        WHERE ak.prefix = ${prefix}
          AND ak.last4 = ${last4}
          AND ak.deleted_at IS NULL
          AND p.deleted_at IS NULL
        LIMIT 1
      `);

      if (!result.rows || result.rows.length === 0) {
        return { valid: false, error: "API key not found" };
      }

      const row = result.rows[0] as any;

      // Verify the hash
      const crypto = await import("crypto");
      const computedDigest = crypto
        .createHmac("sha256", row.salt)
        .update(apiKey)
        .digest("hex");

      if (computedDigest !== row.digest) {
        return { valid: false, error: "Invalid API key" };
      }

      // Check if key and project are active
      if (!row.key_is_active) {
        return { valid: false, error: "API key is paused" };
      }

      if (!row.project_is_active) {
        return { valid: false, error: "Project is paused" };
      }

      return {
        valid: true,
        apiKeyId: row.api_key_id,
        projectId: row.project_id,
        userId: row.user_id,
        keyType: row.key_type_id,
        isActive: true,
        isInternal: row.is_internal || false,
        projectName: row.project_name,
      };
    } catch (error) {
      this.logger.error("[AgentKitInternalService] Error verifying API key", {
        error,
      });
      return { valid: false, error: "Verification failed" };
    }
  }

  /**
   * Log usage from Agent Kit backend
   * Handles credit deduction based on internal status
   */
  async logUsage(request: LogUsageRequest): Promise<void> {
    const {
      apiKeyId,
      projectId,
      userId,
      metric,
      value,
      requestId,
      endUserId,
      metadata,
    } = request;

    // Check if this is an internal project (bypass billing)
    const isInternal = await this.isInternalProject(projectId);

    // Calculate credits for this usage
    const credits = getCredits(MetricCategory.AGENT_KIT, metric, value);

    const timestamp = new Date();
    const month = dayjs(timestamp).format("YYYY-MM");

    await this.database.transaction(async (tx) => {
      // Always log usage (for tracking/analytics)
      await tx.insert(usageLogs).values({
        requestId: requestId || crypto.randomUUID(),
        userId,
        apiKeyId,
        projectId,
        timestamp,
        metricCategory: MetricCategory.AGENT_KIT,
        metricName: metric,
        value: String(value),
        creditUsed: credits.toFixed(6),
        metadata: {
          ...metadata,
          endUserId,
          isInternal,
          billedCredits: isInternal ? 0 : credits,
        },
      });

      // Update monthly stats
      await tx
        .insert(usageMonthlyStats)
        .values({
          userId,
          apiKeyId,
          projectId,
          month,
          requests: 1,
          totalCredits: isInternal ? "0" : credits.toFixed(6),
        })
        .onConflictDoUpdate({
          target: [
            usageMonthlyStats.userId,
            usageMonthlyStats.apiKeyId,
            usageMonthlyStats.projectId,
            usageMonthlyStats.month,
          ],
          set: {
            requests: sql`${usageMonthlyStats.requests} + 1`,
            totalCredits: isInternal
              ? usageMonthlyStats.totalCredits
              : sql`${usageMonthlyStats.totalCredits} + ${credits}`,
            updatedAt: sql`now()`,
          },
        });

      // Only deduct credits if NOT internal
      if (!isInternal && credits > 0) {
        await this.deductCredits(tx, userId, credits);
      }
    });

    this.logger.info("[AgentKitInternalService] Usage logged", {
      apiKeyId,
      projectId,
      metric,
      value,
      credits,
      isInternal,
      billed: !isInternal,
    });
  }

  /**
   * Register an end user for per-user monthly billing
   * Only charges once per user per project per month
   */
  async registerEndUser(
    request: RegisterEndUserRequest
  ): Promise<RegisterEndUserResponse> {
    const { projectId, externalUserId } = request;
    const billingMonth = dayjs().startOf("month").format("YYYY-MM-DD");

    // Check if this is an internal project
    const isInternal = await this.isInternalProject(projectId);

    try {
      // Try to insert the end user record
      const result = await this.database.execute(sql`
        INSERT INTO agent_kit_end_users (project_id, external_user_id, billing_month, charged)
        VALUES (${projectId}, ${externalUserId}, ${billingMonth}::date, ${!isInternal})
        ON CONFLICT (project_id, external_user_id, billing_month)
        DO UPDATE SET last_active_at = NOW()
        RETURNING
          id,
          (xmax = 0) as is_new,
          charged
      `);

      const row = (result.rows?.[0] as any) || {};
      const isNewUser = row.is_new === true;
      const wasCharged = row.charged === true;

      // If new user and not internal, charge the per-user fee
      if (isNewUser && !isInternal) {
        // Get project owner's user ID
        const projectOwner = await this.getProjectOwner(projectId);
        if (projectOwner) {
          await this.database.transaction(async (tx) => {
            await this.deductCredits(tx, projectOwner, AGENT_KIT_PER_USER_CREDITS);
          });
        }
      }

      return {
        success: true,
        isNewUser,
        charged: isNewUser && !isInternal,
        creditsCharged: isNewUser && !isInternal ? AGENT_KIT_PER_USER_CREDITS : 0,
        billingMonth,
      };
    } catch (error) {
      this.logger.error("[AgentKitInternalService] Error registering end user", {
        error,
        projectId,
        externalUserId,
      });
      return {
        success: false,
        isNewUser: false,
        charged: false,
        billingMonth,
      };
    }
  }

  /**
   * Check if a project is internal (bypasses billing)
   */
  private async isInternalProject(projectId: string): Promise<boolean> {
    try {
      const result = await this.database.execute(sql`
        SELECT COALESCE(is_internal, false) as is_internal
        FROM projects
        WHERE id = ${projectId}
        LIMIT 1
      `);

      return (result.rows?.[0] as any)?.is_internal === true;
    } catch {
      // If we can't check, assume not internal (safe default)
      return false;
    }
  }

  /**
   * Get the owner user ID of a project
   */
  private async getProjectOwner(projectId: string): Promise<string | null> {
    try {
      const result = await this.database.execute(sql`
        SELECT user_id FROM projects WHERE id = ${projectId} LIMIT 1
      `);
      return (result.rows?.[0] as any)?.user_id || null;
    } catch {
      return null;
    }
  }

  /**
   * Deduct credits from a user's balance
   */
  private async deductCredits(
    tx: any,
    userId: string,
    credits: number
  ): Promise<void> {
    if (credits <= 0) return;

    // Get current billing info
    const [userBilling] = await tx
      .select({
        currentTemporaryCreditAmount: usersBilling.currentTemporaryCreditAmount,
        currentPersistentCreditAmount: usersBilling.currentPersistentCreditAmount,
        isInternal: usersBilling.isInternal,
      })
      .from(usersBilling)
      .where(eq(usersBilling.userId, userId))
      .limit(1);

    if (!userBilling) {
      this.logger.warn(
        `[AgentKitInternalService] No billing info for user ${userId}`
      );
      return;
    }

    // Internal users bypass credit deduction
    if (userBilling.isInternal) {
      return;
    }

    let remaining = credits;

    // First deduct from temporary credits
    const temp = Number(userBilling.currentTemporaryCreditAmount || 0);
    if (temp > 0 && remaining > 0) {
      const usedTemp = Math.min(temp, remaining);
      await this.billingService.subtractTemporaryCreditFromUserWithTx(
        tx,
        userId,
        usedTemp,
        "Agent Kit usage"
      );
      remaining -= usedTemp;
    }

    // Then from persistent credits
    const pers = Number(userBilling.currentPersistentCreditAmount || 0);
    if (pers > 0 && remaining > 0) {
      const usedPers = Math.min(pers, remaining);
      await this.billingService.subtractPersistentCreditFromUserWithTx(
        tx,
        userId,
        usedPers,
        "Agent Kit usage"
      );
      remaining -= usedPers;
    }

    if (remaining > 0) {
      this.logger.warn(
        `[AgentKitInternalService] User ${userId} has insufficient credits (missing ${remaining})`
      );
    }
  }

  /**
   * Get end user stats for a project
   */
  async getEndUserStats(
    projectId: string,
    month?: string
  ): Promise<{
    totalUsers: number;
    chargedUsers: number;
    totalCreditsCharged: number;
  }> {
    const billingMonth = month || dayjs().startOf("month").format("YYYY-MM-DD");

    const result = await this.database.execute(sql`
      SELECT
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE charged = true) as charged_users
      FROM agent_kit_end_users
      WHERE project_id = ${projectId}
        AND billing_month = ${billingMonth}::date
    `);

    const row = (result.rows?.[0] as any) || {};
    const chargedUsers = Number(row.charged_users || 0);

    return {
      totalUsers: Number(row.total_users || 0),
      chargedUsers,
      totalCreditsCharged: chargedUsers * AGENT_KIT_PER_USER_CREDITS,
    };
  }
}
