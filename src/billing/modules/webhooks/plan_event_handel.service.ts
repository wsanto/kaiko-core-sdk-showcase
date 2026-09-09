import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { Database, plans } from "../../db";

@autoInjectable()
export class PlanService {
  constructor(
    @inject("DB") private database: Database,
    @inject("LOGGER") private logger: Logger,
    @inject("STRIPE") private stripe: Stripe
  ) { }

  async handleProductCreated(product: Stripe.Product) {
    const prices = await this.stripe.prices.list({ product: product.id, active: true });

    if (prices.data.length === 0) {
      this.logger.info(`No active prices for new product ${product.id}, skipping creation`);
      return;
    }

    for (const price of prices.data) {
      await this.handlePlanOrPriceCreated(price);
    }
  }

  async handleProductUpdated(eventData: { object: Stripe.Product; previous_attributes: Record<string, any> }) {
    const product = eventData.object;
    const previous = eventData.previous_attributes;

    const nameChanged = previous.name !== undefined && previous.name !== product.name;
    let creditsChanged = false;

    if (previous.metadata !== undefined) {
      const oldCredits = (previous.metadata as Record<string, string>).credits || "0";
      const newCredits = product.metadata?.credits || "0";
      creditsChanged = oldCredits !== newCredits;
    }

    if (!nameChanged && !creditsChanged) {
      this.logger.info(`No significant changes for product ${product.id}, skipping update`);
      return;
    }

    const prices = await this.stripe.prices.list({ product: product.id, active: true });

    if (prices.data.length === 0) {
      this.logger.info(`No active prices for product ${product.id}, skipping update`);
      return;
    }

    for (const price of prices.data) {
      const existingPlan = await this.database
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.stripePriceId, price.id))
        .limit(1);

      if (existingPlan.length === 0) {
        this.logger.info(`No plan for price ${price.id}, skipping`);
        continue;
      }

      const updateData: any = { updatedAt: new Date() };

      if (nameChanged) updateData.name = product.name;
      if (creditsChanged) updateData.credits = parseInt((product.metadata?.credits as string) || "0");

      await this.database.update(plans).set(updateData).where(eq(plans.stripePriceId, price.id));
      this.logger.info(`Updated plan for price ${price.id}`);
    }
  }

  async handleProductDeleted(product: Stripe.Product) {
    const prices = await this.stripe.prices.list({ product: product.id });
    if (prices.data.length === 0) {
      this.logger.info(`No prices for deleted product ${product.id}, skipping cleanup`);
      return;
    }

    for (const price of prices.data) {
      await this.handlePriceOrPlanDeleted(price);
    }
  }

  async handlePriceCreated(price: Stripe.Price) {
    await this.handlePlanOrPriceCreated(price);
  }

  async handlePriceUpdated(eventData: { object: Stripe.Price; previous_attributes: Record<string, any> }) {
    const price = eventData.object;
    const previous = eventData.previous_attributes;

    const amountChanged = previous.unit_amount_decimal !== undefined && previous.unit_amount_decimal !== price.unit_amount_decimal;
    let periodChanged = false;
    if (previous.recurring !== undefined) {
      const oldInterval = (previous.recurring as Record<string, any>).interval as string | undefined;
      periodChanged = oldInterval !== price.recurring?.interval;
    }
    const activeChanged = previous.active !== undefined && previous.active !== price.active;

    if (!amountChanged && !periodChanged && !activeChanged) {
      this.logger.info(`No significant changes for price ${price.id}, skipping update`);
      return;
    }

    const existingPlan = await this.database
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.stripePriceId, price.id))
      .limit(1);

    if (existingPlan.length === 0) {
      this.logger.info(`No plan for price ${price.id}, skipping update`);
      return;
    }

    if (activeChanged && !price.active) {
      await this.database.delete(plans).where(eq(plans.stripePriceId, price.id));
      this.logger.info(`Deactivated and deleted plan for price ${price.id}`);
      return;
    }

    const updateData: any = { updatedAt: new Date() };
    if (amountChanged) {
      updateData.amount = (Number(price.unit_amount_decimal ?? 0) / 100).toFixed(6);
    }
    if (periodChanged) updateData.periodType = price.recurring?.interval || "month";

    await this.database.update(plans).set(updateData).where(eq(plans.stripePriceId, price.id));
    this.logger.info(`Updated plan for price ${price.id}`);
  }

  async handlePriceDeleted(price: Stripe.Price) {
    await this.handlePriceOrPlanDeleted(price);
  }

  private async handlePlanOrPriceCreated(priceOrPlan: Stripe.Price) {
    const stripePriceId = priceOrPlan.id;
    const productId = typeof priceOrPlan.product === "string" ? priceOrPlan.product : priceOrPlan.product?.id;

    if (!productId) {
      this.logger.warn(`Price/Plan ${stripePriceId} has no product, skipping`);
      return;
    }

    const product = (await this.stripe.products.retrieve(productId)) as Stripe.Product;

    const existing = await this.database
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.stripePriceId, stripePriceId))
      .limit(1);

    if (existing.length > 0) {
      this.logger.info(`Plan/Price ${stripePriceId} already exists, skipping creation`);
      return;
    }

    const amount = (Number(priceOrPlan.unit_amount_decimal ?? 0) / 100).toFixed(6);

    await this.database.insert(plans).values({
      name: product.name,
      stripePriceId,
      amount,
      periodType: priceOrPlan.recurring?.interval || "month",
      credits: parseInt((product.metadata?.credits as string) || "0"),
    });
  }

  private async handlePriceOrPlanDeleted(priceOrPlan: Stripe.Price) {
    const stripePriceId = priceOrPlan.id;

    const existing = await this.database
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.stripePriceId, stripePriceId))
      .limit(1);

    if (existing.length === 0) {
      this.logger.info(`No plan found for deleted price/plan ${stripePriceId}, skipping deletion`);
      return;
    }

    await this.database.delete(plans).where(eq(plans.stripePriceId, stripePriceId));
  }
}
