import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { Database, plans, userSubscriptions } from "../../db";
import { InsertSubscriptionData, UpdateSubscriptionData } from "./types";

@autoInjectable()
export class SubscriptionService {
  constructor(
    @inject("DB") private database: Database,
    @inject("LOGGER") private logger: Logger
  ) { }

  async handleSubscriptionCreated(event: Stripe.Event) {
    const subscription = event.data.object as Stripe.Subscription;
    this.logger.info(`Handling subscription created for ${subscription.id}`);
    await this.processSubscription(subscription, 'created');
  }

  async handleSubscriptionUpdated(event: Stripe.Event) {
    const subscription = event.data.object as Stripe.Subscription;
    const previousAttributes = event.data.previous_attributes as Record<string, any> | undefined;
    this.logger.info(`Handling subscription updated for ${subscription.id}`);
    await this.processSubscription(subscription, 'updated', previousAttributes);
  }

  async handleSubscriptionDeleted(event: Stripe.Event) {
    const subscription = event.data.object as Stripe.Subscription;
    this.logger.info(`Handling subscription deleted for ${subscription.id}`);
    await this.processSubscription(subscription, 'deleted');
  }

  private async processSubscription(
    subscription: Stripe.Subscription,
    eventType: 'created' | 'updated' | 'deleted',
    previousAttributes?: Record<string, any>
  ) {
    const userId = subscription.metadata?.userId;
    if (!userId) {
      this.logger.warn(`No userId in metadata for subscription ${subscription.id}, skipping`);
      return;
    }

    const stripeSubId = subscription.id;
    const item = subscription.items?.data[0];
    if (!item) {
      this.logger.warn(`No subscription items for ${subscription.id}, skipping`);
      return;
    }

    const priceId = item.price.id;
    const planQuery = await this.database
      .select()
      .from(plans)
      .where(eq(plans.stripePriceId, priceId))
      .limit(1);

    if (planQuery.length === 0) {
      this.logger.error(`No plan found for price ${priceId} in subscription ${subscription.id}, skipping`);
      return;
    }

    const [planRecord] = planQuery;

    const rawAmount = item.price.unit_amount_decimal ?? planRecord.amount;
    const planChargeAmount = (Number(rawAmount) / 100).toFixed(6);

    const dbStatus = this.mapStripeStatusToDbStatus(subscription, previousAttributes);
    const periodStart = new Date(item.current_period_start * 1000);
    const periodEnd = new Date(item.current_period_end * 1000);
    const error = subscription.status === 'incomplete_expired' || subscription.status === 'past_due' ? 'Payment failed or cancel before payment' : null;

    const commonData: UpdateSubscriptionData = {
      userId,
      planId: planRecord.id,
      planChargeAmount,
      status: dbStatus,
      error,
      periodStart,
      periodEnd,
      updatedAt: new Date(),
    };

    const existingSub = await this.database
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.stripeSubId, stripeSubId))
      .limit(1);

    if (existingSub.length > 0) {
      const updateData: UpdateSubscriptionData = eventType === 'deleted' ? { ...commonData, status: 'canceled' } : commonData;
      await this.database
        .update(userSubscriptions)
        .set(updateData)
        .where(eq(userSubscriptions.stripeSubId, stripeSubId));
      this.logger.info(`Updated subscription record for ${stripeSubId} on ${eventType}`);
    } else if (eventType === 'created') {
      const insertData: InsertSubscriptionData = {
        ...commonData,
        stripeSubId,
        createdAt: new Date(),
      };
      await this.database.insert(userSubscriptions).values(insertData);
      this.logger.info(`Created subscription record for ${stripeSubId}`);
    } else {
      this.logger.warn(`No existing record for ${stripeSubId} on ${eventType}, skipping`);
    }
  }

  private mapStripeStatusToDbStatus(
    subscription: Stripe.Subscription,
    previousAttributes?: Record<string, any>
  ): 'active' | 'canceled' | 'payment_error' {
    const isCanceled =
      subscription.cancel_at_period_end ||
      subscription.canceled_at !== null ||
      subscription.status === 'canceled';

    if (isCanceled) return 'canceled';
    if (subscription.status === 'past_due' || subscription.status === 'incomplete_expired') return 'payment_error';
    return 'active';
  }
}
