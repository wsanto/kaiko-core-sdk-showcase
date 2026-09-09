import { numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { plans } from "./plans";

export const userSubscriptions = pgTable("user_subscriptions", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    planChargeAmount: numeric("plan_charge_amount", { precision: 20, scale: 6 }).notNull(),
    stripeSubId: varchar("stripe_sub_id", { length: 255 }).notNull().unique(),
    status: varchar("status", { length: 50 }).notNull().$type<"active" | "canceled" | "payment_error">(),
    error: text("error"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
