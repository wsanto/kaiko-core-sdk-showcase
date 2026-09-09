export type ListProjectFilters = {
    isActive?: boolean;
    name?: string
};
export interface ProjectStats {
    activeApiKeys: number;
    totalRequests: number;
    monthlySpend: number;
    createdDate: string;
}

export interface UserProjectStats {
    totalProjects: number;
    activeProjects: number;
    totalApiKeys: number;
    monthlyRequests: number;
}

export interface ApiKeyUsage {
    name: string;
    stats: {
        requests: number;
        spend: number;
    };
}

export interface ApiKeyMonthlyUsage {
    monthName: string;
    apiKeys: ApiKeyUsage[];
}

export interface MonthlyUsage {
    monthName: string;
    requests: number;
    spend: number;
}