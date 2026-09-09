import { jsonb, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const usageLogs = pgTable("usage_logs", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    apiKeyId: uuid("api_key_id").notNull(),
    projectId: uuid("project_id").notNull(),
    requestId: varchar("request_id", { length: 255 }).notNull(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    metricCategory: varchar("metric_category", { length: 50 }).notNull(),
    metricName: varchar("metric_name", { length: 50 }).notNull(),
    value: jsonb("value").notNull().$type<string | number>(),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    creditUsed: numeric("credit_used", { precision: 20, scale: 6 }).default("0"),
});
