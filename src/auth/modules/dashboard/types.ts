
export interface DashboardStats {
    activeApiKeys: {
        value: number;
        change: string;
    };
    projects: {
        value: number;
        change: string;
    };
    monthlySpend: {
        value: number;
        change: string;
    };
    apiRequests: {
        value: number;
        change: string;
    };
}


export interface ChartDataPoint {
    monthName: string;
    requests: number;
    tokenUsed: number;
}