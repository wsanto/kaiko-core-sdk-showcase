import { pgTable, uuid, numeric, jsonb, timestamp, text } from "drizzle-orm/pg-core";
import { billings } from "./billings";

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  billingId: uuid("billing_id").references(() => billings.id),
  userId: uuid("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  paymentInfo: jsonb("payment_info"),
  taxRatio: numeric("tax_ratio", { precision: 5, scale: 4 }),
  taxAmount: numeric("tax_amount", { precision: 20, scale: 6 }),
  totalAmount: numeric("total_amount", { precision: 20, scale: 6 }),
  status: text("status").notNull().default("draft"),

  stripeInvoiceId: text("stripe_invoice_id"),
});
