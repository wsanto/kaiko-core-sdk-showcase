import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./user";

export const project = pgTable("projects", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    userId: uuid("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    systemConfig: jsonb("system_config").$type<{ tier?:string  }>(),
    config: jsonb("config"),
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
});
