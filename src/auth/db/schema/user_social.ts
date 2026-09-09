import {
  pgTable,
  uuid,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./user";

export const userSocial = pgTable("user_socials", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

