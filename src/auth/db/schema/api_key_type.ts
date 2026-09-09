import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const apiKeyType = pgTable("api_key_types", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 50 }).notNull().unique(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date()),
});
