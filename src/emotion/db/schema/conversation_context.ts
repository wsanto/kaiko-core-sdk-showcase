import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const conversationContext = pgTable("conversation_contexts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  externalId: text("external_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

