import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { conversationContext } from "./conversation_context";
import { relations } from 'drizzle-orm';

export interface EmotionResults {
  model: string;
  predict: {
    [key: string]: number;
  }
}
export const emotionsMessage = pgTable("emotions_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  contextId: uuid("context_id").notNull().references(() => conversationContext.id),
  externalId: text("external_id"),
  message: text("message").notNull(),
  role: text("role").notNull(),
  emotionsResults: jsonb("emotions_results").notNull().$type<EmotionResults>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emotionsMessageRelations = relations(emotionsMessage, ({ one }) => ({
  context: one(conversationContext, {
    fields: [emotionsMessage.contextId],
    references: [conversationContext.id],
  }),
}));

export const conversationContextRelations = relations(conversationContext, ({ many }) => ({
  messages: many(emotionsMessage),
}));