import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { apiKeyType } from "./api_key_type";
import { project } from "./project";

export const apiKey = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    keyTypeId: uuid("key_type_id").references(() => apiKeyType.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }),
    prefix: varchar("prefix", { length: 16 }).notNull(),
    digest: text("digest").notNull(),
    last4: varchar("last4", { length: 4 }).notNull(),
    salt: varchar("salt", { length: 32 }).notNull(),
    encryptedKey: text("encrypted_key"),
    encryptionIv: varchar("encryption_iv", { length: 32 }),
    metadata: jsonb("metadata").notNull().default({}),
    lastRotationDate: date("last_rotation_date"),
    isActive: boolean("is_active").default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_api_keys_prefix_last4").on(t.prefix, t.last4),
    uniqueIndex("uq_api_keys_digest").on(t.digest),
    index("idx_api_keys_key_type_id").on(t.keyTypeId),
  ]
);
