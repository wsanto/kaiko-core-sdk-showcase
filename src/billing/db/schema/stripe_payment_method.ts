import { jsonb, pgTable, uuid } from "drizzle-orm/pg-core";

export type StripePaymentMethodMetadata = {
  isDefault: boolean;
  type: string;
}
export const stripePaymentMethods = pgTable("stripe_payment_methods", {
  userId: uuid("user_id").notNull(),
  stripePaymentMethodId: uuid("stripe_payment_method_id").notNull(),
  metadata: jsonb("metadata").$type<StripePaymentMethodMetadata>().default({ isDefault: false, type: "card" }),
});