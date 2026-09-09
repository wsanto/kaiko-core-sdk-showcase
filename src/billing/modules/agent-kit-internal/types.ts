export interface VerifyApiKeyRequest {
  apiKey: string;
}

export interface VerifyApiKeyResponse {
  valid: boolean;
  apiKeyId?: string;
  projectId?: string;
  userId?: string;
  keyType?: string;
  isActive?: boolean;
  isInternal?: boolean;  // Internal projects bypass billing
  projectName?: string;
  error?: string;
}

export interface LogUsageRequest {
  apiKeyId: string;
  projectId: string;
  userId: string;
  metric: string;
  value: number;
  requestId?: string;
  endUserId?: string;  // Developer's end user ID for per-user billing
  metadata?: Record<string, any>;
}

export interface RegisterEndUserRequest {
  projectId: string;
  externalUserId: string;
}

export interface RegisterEndUserResponse {
  success: boolean;
  isNewUser: boolean;
  charged: boolean;
  creditsCharged?: number;
  billingMonth: string;
}

export interface AgentKitEndUser {
  id: string;
  projectId: string;
  externalUserId: string;
  firstSeenAt: Date;
  lastActiveAt: Date;
  billingMonth: Date;
  charged: boolean;
}
