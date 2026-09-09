import { pgTable, uuid, text, jsonb, integer, numeric } from "drizzle-orm/pg-core";

export const billingItems = pgTable("billing_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  metadata: jsonb("metadata"),
  quantity: integer("quantity").notNull(),
  billingId: uuid("billing_id").notNull(),
  unitPrice: numeric("unit_price").notNull(),
});