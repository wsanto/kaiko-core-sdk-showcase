export type MonthlyStats = {
    month: string;
    totalCredits: number;
    requests: number;
};

export type ProjectMonthlyStats = {
    totalRequests: number;
    monthlySpend: number;
};

export type ApiKeyStats = {
    month: string;
    apiKeyId: string;
    requests: number;
    totalCredits: number;
};

export interface ApiKeyUsageStat {
    apiKeyId: string;
    totalRequests: number;
    totalCredits: number;
    lastUsedAt: string | null;
}

export interface ProjectUsageSummary {
    projectId: string;
    totalRequests: number;
    totalCredits: number;
    apiKeyCount: number;
    lastUsedAt: string | null;
}
