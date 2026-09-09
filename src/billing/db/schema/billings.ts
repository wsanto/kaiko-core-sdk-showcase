import { customTSRange } from "@shared/types/tsrange";
import { pgTable, uuid } from "drizzle-orm/pg-core";

export const billings = pgTable("billings", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id"),
    userId: uuid("user_id").notNull(),
    period: customTSRange("period").notNull(),
});