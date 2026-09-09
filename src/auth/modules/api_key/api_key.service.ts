import { ApiKeyUsageStat } from "@shared/types/billing-client";
import { omitKeys } from "@shared/utils";
import { DEFAULT_API_KEY_TYPE } from "@shared/constants";
import crypto from "crypto";
import {
  and,
  eq,
  getTableColumns,
  gt,
  InferSelectModel,
  isNull,
  like,
  or
} from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import {
  apiKey as apiKeySchema,
  apiKeyType as apiKeyTypeSchema,
  Database,
  project as projectSchema,
} from "../../db";
import { BillingAdapterService } from "../adapter";
import { CreateApiKeyInput, ListApiKeyFilters, ProjectListApiKeyFilters } from "./types";

const API_KEY_PREFIX_LENGTH = 10;
const API_KEY_SUFFIX_LENGTH = 4;
const API_KEY_LENGTH = 32;

@autoInjectable()
export default class ApiKeyService {
  constructor(
    @inject("DB") private db: Database,
    @inject("LOGGER") private logger: Logger,
    @inject(BillingAdapterService) private billingAdapterService: BillingAdapterService
  ) { }

  keyGenerator = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", API_KEY_LENGTH);
  hashFunction = (key: string, salt: string) => crypto.createHmac("sha256", salt).update(key).digest("hex");
  randomHex = (length: number) => crypto.randomBytes(length).toString("hex");

  // Encryption utilities for persistent API key visibility
  private getEncryptionKey(): Buffer | null {
    const key = process.env.API_KEY_ENCRYPTION_KEY;
    if (!key || key.length !== 64) {
      this.logger.warn("API_KEY_ENCRYPTION_KEY not configured or invalid length (expected 64 hex chars)");
      return null;
    }
    return Buffer.from(key, "hex");
  }

  private encryptKey(key: string): { encrypted: string; iv: string } | null {
    const encryptionKey = this.getEncryptionKey();
    if (!encryptionKey) return null;

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);

      let encrypted = cipher.update(key, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag().toString("hex");

      return {
        encrypted: encrypted + authTag,
        iv: iv.toString("hex"),
      };
    } catch (error) {
      this.logger.error("Failed to encrypt API key", { error });
      return null;
    }
  }

  private decryptKey(encrypted: string, iv: string): string | null {
    const encryptionKey = this.getEncryptionKey();
    if (!encryptionKey || !encrypted || !iv) return null;

    try {
      const authTag = Buffer.from(encrypted.slice(-32), "hex");
      const encryptedText = encrypted.slice(0, -32);

      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        Buffer.from(iv, "hex")
      );
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedText, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      this.logger.error("Failed to decrypt API key", { error });
      return null;
    }
  }

  apiKeyColumnsWithoutSensitive = omitKeys(getTableColumns(apiKeySchema), ["digest", "salt"]);
  projectColumnsWithoutSensitive = omitKeys(getTableColumns(projectSchema), ["systemConfig"]);
  IdReturn = { id: apiKeySchema.id };


  async createByProjectId(projectId: string, param: CreateApiKeyInput): Promise<
    Omit<InferSelectModel<typeof apiKeySchema>, "digest" | "salt" | "prefix" | "last4"> & { value: string } | null
  > {
    const { key, digest, salt, prefix, last4 } = this.generateKeyData();

    // Encrypt the key for persistent storage
    const encryptedData = this.encryptKey(key);

    // Use provided keyTypeId or default to Synapse API Key type
    const keyTypeId = param.keyTypeId || DEFAULT_API_KEY_TYPE;

    const [newApiKey] = await this.db
      .insert(apiKeySchema)
      .values({
        name: param.name,
        keyTypeId,
        projectId,
        metadata: param.metadata,
        prefix,
        digest,
        salt,
        last4,
        encryptedKey: encryptedData?.encrypted ?? null,
        encryptionIv: encryptedData?.iv ?? null,
      })
      .returning(this.apiKeyColumnsWithoutSensitive);

    return {
      ...newApiKey,
      value: key,
    };
  }

  async rotate(apiKeyId: string): Promise<
    Omit<InferSelectModel<typeof apiKeySchema>, "digest" | "salt" | "prefix" | "last4"> & { value: string } | null
  > {
    const [existing] = await this.db
      .select(this.apiKeyColumnsWithoutSensitive)
      .from(apiKeySchema)
      .where(and(eq(apiKeySchema.id, apiKeyId), isNull(apiKeySchema.deletedAt)));

    if (!existing) return null;

    const { key, digest, salt, prefix, last4 } = this.generateKeyData();

    // Encrypt the new key for persistent storage
    const encryptedData = this.encryptKey(key);

    const [updated] = await this.db
      .update(apiKeySchema)
      .set({
        digest,
        salt,
        prefix,
        last4,
        encryptedKey: encryptedData?.encrypted ?? null,
        encryptionIv: encryptedData?.iv ?? null,
        updatedAt: new Date(),
      })
      .where(eq(apiKeySchema.id, apiKeyId))
      .returning(this.apiKeyColumnsWithoutSensitive);

    return updated ? { ...updated, value: key } : null;
  }
  async deleteByProjectId(projectId: string, apiKeyId: string) {
    const [deletedApiKey] = await this.db
      .update(apiKeySchema)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(apiKeySchema.id, apiKeyId),
          eq(apiKeySchema.projectId, projectId),
          isNull(apiKeySchema.deletedAt)
        )
      )
      .returning(this.IdReturn);

    return deletedApiKey ?? null;
  }


  async listByProjectId(projectId: string, filters: ProjectListApiKeyFilters = {}) {
    const conditions: any[] = [
      isNull(apiKeySchema.deletedAt),
      eq(apiKeySchema.projectId, projectId)
    ];

    if (filters.typeId) {
      conditions.push(eq(apiKeySchema.keyTypeId, filters.typeId));
    }
    if (filters.isActive) {
      conditions.push(eq(apiKeySchema.isActive, filters.isActive));
    }
    if (filters.name) {
      conditions.push(like(apiKeySchema.name, filters.name));
    }

    const apiKeys = await this.db
      .select(this.apiKeyColumnsWithoutSensitive)
      .from(apiKeySchema)
      .where(and(...conditions));

    return apiKeys;
  }

  async update(apiKeyId: string, payload: {
    name?: string;
    keyTypeId?: string;
    metadata?: Record<string, any>;
    isActive?: boolean;
  }) {

    const updates: Partial<typeof apiKeySchema.$inferInsert> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.keyTypeId !== undefined) updates.keyTypeId = payload.keyTypeId;
    if (payload.metadata !== undefined) updates.metadata = payload.metadata;
    if (payload.isActive !== undefined) updates.isActive = payload.isActive;

    if (Object.keys(updates).length === 0) {
      return null;
    }

    const [updatedApiKey] = await this.db
      .update(apiKeySchema)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(apiKeySchema.id, apiKeyId), isNull(apiKeySchema.deletedAt)))
      .returning(this.apiKeyColumnsWithoutSensitive);

    return updatedApiKey ?? null;
  }

  async list(userId: string, filters: ListApiKeyFilters = {}) {
    const conditions: any[] = [
      isNull(apiKeySchema.deletedAt),
      eq(projectSchema.userId, userId),
    ];

    if (filters.projectId) {
      conditions.push(eq(apiKeySchema.projectId, filters.projectId));
    }
    if (filters.typeId) {
      conditions.push(eq(apiKeySchema.keyTypeId, filters.typeId));
    }
    if (filters.isActive !== undefined) {
      conditions.push(eq(apiKeySchema.isActive, filters.isActive));
    }
    if (filters.name) {
      conditions.push(like(apiKeySchema.name, `%${filters.name}%`));
    }
    const env = process.env.API_KEY_ENV || "prod";
    const result = await this.db
      .select({
        apiKey: {
          ...this.apiKeyColumnsWithoutSensitive,
          encryptedKey: apiKeySchema.encryptedKey,
          encryptionIv: apiKeySchema.encryptionIv,
        },
        project: this.projectColumnsWithoutSensitive,
      })
      .from(apiKeySchema)
      .leftJoin(projectSchema, eq(projectSchema.id, apiKeySchema.projectId))
      .where(and(...conditions));

    // Decrypt keys and include in response
    const apiKeys = result.map(({ apiKey, project }) => {
      const decryptedValue = apiKey.encryptedKey && apiKey.encryptionIv
        ? this.decryptKey(apiKey.encryptedKey, apiKey.encryptionIv)
        : null;

      // Remove encrypted fields from response
      const { encryptedKey: _, encryptionIv: __, ...apiKeyWithoutEncrypted } = apiKey;

      return {
        ...apiKeyWithoutEncrypted,
        env,
        project,
        value: decryptedValue,
      };
    });

    if (!apiKeys.length || !this.billingAdapterService) return apiKeys;

    const apiKeyIds = apiKeys.map((k) => k.id);

    let usageStats: ApiKeyUsageStat[] = [];
    try {
      usageStats = await this.billingAdapterService.getApiKeysUsage(apiKeyIds);
    } catch (error) {
      this.logger.error('Failed to fetch API key usage stats, returning keys without usage data:', {
        apiKeyIds,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const usageMap = new Map<string, ApiKeyUsageStat>();
    for (const stat of usageStats) {
      usageMap.set(stat.apiKeyId, stat);
    }

    const merged = apiKeys.map((key) => ({
      ...key,
      usage: {
        requests: usageMap.get(key.id)?.totalRequests ?? 0,
        totalCredits: usageMap.get(key.id)?.totalCredits ?? 0,
        lastUsed: usageMap.get(key.id)?.lastUsedAt ?? null,
      },
    }));

    return merged;
  }


  async pause(apiKeyId: string) {
    const [updated] = await this.db
      .update(apiKeySchema)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(apiKeySchema.id, apiKeyId), isNull(apiKeySchema.deletedAt)))
      .returning(this.apiKeyColumnsWithoutSensitive);

    return updated ?? null;
  }

  async resume(apiKeyId: string) {
    const [updated] = await this.db
      .update(apiKeySchema)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(apiKeySchema.id, apiKeyId), isNull(apiKeySchema.deletedAt)))
      .returning(this.apiKeyColumnsWithoutSensitive);

    return updated ?? null;
  }

  async listTypes() {
    return this.db.select().from(apiKeyTypeSchema);
  }

  async isValidProject(userId: string, projectId: string): Promise<boolean> {
    const project = await this.db.query.project.findFirst({
      where: and(
        eq(projectSchema.id, projectId),
        eq(projectSchema.userId, userId),
      ),
    });
    return !!project;
  }

  async isValidApiKey(userId: string, apiKeyId: string): Promise<boolean> {
    const record = await this.db
      .select({ id: apiKeySchema.id })
      .from(apiKeySchema)
      .innerJoin(projectSchema, eq(apiKeySchema.projectId, projectSchema.id))
      .where(
        and(
          eq(apiKeySchema.id, apiKeyId),
          eq(projectSchema.userId, userId),
          isNull(apiKeySchema.deletedAt)
        )
      )
      .limit(1);

    return record.length > 0;
  }

  async verifyApiKey(apiKey: string) {
    const prefix = apiKey.slice(0, API_KEY_PREFIX_LENGTH);
    const candidateLast4 = apiKey.slice(-API_KEY_SUFFIX_LENGTH);

    const candidate = await this.db.query.apiKey.findFirst({
      with: {
        project: true,
      },
      where: and(
        eq(apiKeySchema.prefix, prefix),
        eq(apiKeySchema.last4, candidateLast4),
        eq(apiKeySchema.isActive, true),
        isNull(apiKeySchema.deletedAt),
        or(
          isNull(apiKeySchema.expiresAt),
          gt(apiKeySchema.expiresAt, new Date())
        )
      ),
    });

    if (!candidate) {
      return null;
    }

    const digest = this.hashFunction(apiKey, candidate.salt);
    const digestBuffer = Buffer.from(digest, "hex");
    const candidateBuffer = Buffer.from(candidate.digest, "hex");

    if (
      digestBuffer.length !== candidateBuffer.length ||
      !crypto.timingSafeEqual(digestBuffer, candidateBuffer)
    ) {
      return null;
    }

    return candidate;
  }

  async checkStatus(apiKeyId: string): Promise<{
    apiKey: { id: string; name: string | null; isActive: boolean | null };
    project: { id: string; name: string; isActive: boolean };
    isPaused: boolean;
    reason: string | null;
  } | null> {
    const [result] = await this.db
      .select({
        apiKeyId: apiKeySchema.id,
        apiKeyName: apiKeySchema.name,
        apiKeyIsActive: apiKeySchema.isActive,
        projectId: projectSchema.id,
        projectName: projectSchema.name,
        projectIsActive: projectSchema.isActive,
      })
      .from(apiKeySchema)
      .innerJoin(projectSchema, eq(apiKeySchema.projectId, projectSchema.id))
      .where(
        and(
          eq(apiKeySchema.id, apiKeyId),
          isNull(apiKeySchema.deletedAt),
          isNull(projectSchema.deletedAt)
        )
      )
      .limit(1);

    if (!result) return null;

    const apiKeyPaused = !result.apiKeyIsActive;
    const projectPaused = !result.projectIsActive;
    const isPaused = apiKeyPaused || projectPaused;

    let reason: string | null = null;
    if (apiKeyPaused && projectPaused) {
      reason = "Both API key and project are paused";
    } else if (apiKeyPaused) {
      reason = "API key is paused";
    } else if (projectPaused) {
      reason = "Project is paused";
    }

    return {
      apiKey: {
        id: result.apiKeyId,
        name: result.apiKeyName,
        isActive: result.apiKeyIsActive,
      },
      project: {
        id: result.projectId,
        name: result.projectName,
        isActive: result.projectIsActive,
      },
      isPaused,
      reason,
    };
  }

  private generateKeyData() {
    const env = process.env.API_KEY_ENV || "prod";
    const hex = this.keyGenerator();
    const salt = this.randomHex(16);
    const digest = this.hashFunction(hex, salt);
    const key = `sk_${env}_${hex}`;
    return {
      key,
      digest,
      salt,
      prefix: hex.slice(0, API_KEY_PREFIX_LENGTH),
      last4: hex.slice(-API_KEY_SUFFIX_LENGTH),
    };
  }
}
