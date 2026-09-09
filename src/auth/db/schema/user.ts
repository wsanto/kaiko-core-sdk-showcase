import {
    pgTable,
    uuid,
    varchar,
    boolean,
    timestamp,
    text,
} from "drizzle-orm/pg-core";

export const user = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).unique(),
    emailVerified: boolean("email_verified").default(false),
    displayName: varchar("display_name", { length: 255 }),
    elizaEntityId: uuid("eliza_entity_id").unique(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
    lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }),
});
