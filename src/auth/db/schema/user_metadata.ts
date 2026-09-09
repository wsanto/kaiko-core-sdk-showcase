import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
} from "drizzle-orm/pg-core";
import { user } from "./user";

export const userMetadata = pgTable("user_metadata", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").unique().notNull().references(() => user.id, { onDelete: 'cascade' }),
  dataFragment: integer("data_fragment"),
  signalRelayCode: text("signal_relay_code"),
  relayedByOperativeId: uuid("relayed_by_operative_id"),
  waitlistJoinedAt: timestamp("waitlist_joined_at", { withTimezone: true }),
  betaAccessGranted: boolean("beta_access_granted").default(false),
  avatarUrl: text("avatar_url"),
  referralCount: integer("referral_count").default(0),
  dailyLimitRequest: bigint("daily_limit_request", { mode: "number" }).default(10),
  dailyUsedRequest: bigint("daily_used_request", { mode: "number" }).default(0),
  lastTimeRequest: timestamp("last_time_request", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

