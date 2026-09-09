import { integer, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    stripePriceId: varchar("stripe_price_id", { length: 255 }).notNull().unique(),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    periodType: varchar("period_type", { length: 50 }).notNull().default("month"),
    credits: integer("credits").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
