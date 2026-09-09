import { jsonb, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const userLedger = pgTable("user_ledger", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    creditAmount: numeric("credit_amount", { precision: 20, scale: 6 }).notNull(),
    source: varchar("source", { length: 255 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
