import { sql } from "drizzle-orm";
import { date, integer, numeric, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const usageMonthlyStats = pgTable("usage_monthly_stats", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    apiKeyId: uuid("api_key_id").notNull(),
    projectId: uuid("project_id").notNull(),
    month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
    requests: integer("requests").default(0),
    totalCredits: numeric("total_credits", { precision: 20, scale: 6 }).default("0"),
    updatedAt: date("updated_at").default(sql`now()`),
}, (table) => ({
    uniqKey: uniqueIndex("usage_monthly_stats_unique")
        .on(table.userId, table.apiKeyId, table.projectId, table.month),
}));
