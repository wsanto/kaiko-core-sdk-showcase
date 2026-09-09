import { usageLogs } from "@billing/db";
import { Infer } from "@vinejs/vine/types";
import { usageLogPayloadValidator } from "./usage.validator";

export type UsageLogBody = Infer<typeof usageLogPayloadValidator>;
export type UsageLogInsert = typeof usageLogs.$inferInsert;
export type MonthlyStatsGroup = {
    userId: string;
    apiKeyId: string;
    projectId: string;
    month: string;
    requests: number;
    totalCredits: number;
};