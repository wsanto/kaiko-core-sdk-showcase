import { boolean, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const usersBilling = pgTable("users_billing", {
    userId: uuid("user_id").notNull().primaryKey(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).unique(),
    legacyBalance: numeric("legacy_balance", { precision: 20, scale: 6 }).notNull().default("0"),
    currentPersistentCreditAmount: numeric("current_persistent_credit_amount", { precision: 20, scale: 6 }).notNull().default("0"),
    currentTemporaryCreditAmount: numeric("current_temporary_credit_amount", { precision: 20, scale: 6 }).notNull().default("0"),
    currentTemporaryCreditExpiredAt: timestamp("current_temporary_credit_expired_at", { withTimezone: true }),
    lastStripeSyncAt: timestamp("last_stripe_sync_at", { withTimezone: true }),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
