import { and, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { Database, stripePaymentMethods, usageMonthlyStats, usersBilling } from "../../db";
import { PaymentMethodsService } from "../payment_methods";
import { CurrentPersistentCreditAmountResponse, CurrentTemporaryCreditInfoResponse, TopUpResponse } from "./types";
import { TOPUP_CREDITS_RATE, TOPUP_TYPE } from "@shared/constants";

@autoInjectable()
export default class BillingService {
  constructor(
    @inject("DB") private database: Database,
    @inject("LOGGER") private logger: Logger,
    @inject("STRIPE") private stripe: Stripe,
    @inject(PaymentMethodsService) private paymentMethodsService: PaymentMethodsService
  ) { }

  async topUp(userId: string, amount: number, paymentMethodId?: string): Promise<TopUpResponse> {
    if (amount <= 0) {
      throw new Error("Top-up amount must be greater than 0");
    }

    const customerId = await this.paymentMethodsService.getOrCreateStripeCustomer(userId);
    let stripePaymentMethodId = paymentMethodId;
    if (!stripePaymentMethodId) {
      const defaultPaymentMethod = await this.database
        .select({ stripePaymentMethodId: stripePaymentMethods.stripePaymentMethodId })
        .from(stripePaymentMethods)
        .where(and(
          eq(stripePaymentMethods.userId, userId),
          sql`metadata ->> 'isDefault' = 'true'`
        ))
        .limit(1);

      if (defaultPaymentMethod.length < 1) {
        throw new Error("User does not have a default payment method");
      }

      stripePaymentMethodId = defaultPaymentMethod[0].stripePaymentMethodId;
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      customer: customerId,
      payment_method: stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description: `One-time credit top-up for user ${userId}`,
      metadata: {
        userId,
        stripePaymentMethodId,
        type: TOPUP_TYPE
      },
    });

    return {
      amount,
      credit: amount * TOPUP_CREDITS_RATE,
      status: paymentIntent.status,
      clientSecret: paymentIntent.status === "requires_action" ? paymentIntent.client_secret : null,
      createdAt: paymentIntent.created ? new Date(paymentIntent.created * 1000).toISOString() : new Date().toISOString(),
    };
  }
  async getUserPersistentCredit(userId: string): Promise<CurrentPersistentCreditAmountResponse> {
    const [userBilling] = await this.database
      .select({
        currentPersistentCreditAmount: usersBilling.currentPersistentCreditAmount,
        stripeCustomerId: usersBilling.stripeCustomerId,
      })
      .from(usersBilling)
      .where(eq(usersBilling.userId, userId))
      .limit(1);
    return {
      currentPersistentCreditAmount: Number(userBilling?.currentPersistentCreditAmount ?? 0),
      userId,
      stripeCustomerId: userBilling?.stripeCustomerId ?? null,
    };
  }

  async getTemporaryCreditInfo(userId: string): Promise<CurrentTemporaryCreditInfoResponse> {
    const [userBilling] = await this.database
      .select({
        currentTemporaryCreditAmount: usersBilling.currentTemporaryCreditAmount,
        currentTemporaryCreditExpiredAt: usersBilling.currentTemporaryCreditExpiredAt,
        stripeCustomerId: usersBilling.stripeCustomerId,
      })
      .from(usersBilling)
      .where(eq(usersBilling.userId, userId))
      .limit(1);

    const expiredAt = userBilling?.currentTemporaryCreditExpiredAt;
    const now = new Date();

    let daysRemaining: number | null = null;
    if (expiredAt) {
      const diffMs = expiredAt.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      daysRemaining = diffDays > 0 ? diffDays : 0;
    }

    return {
      userId,
      stripeCustomerId: userBilling?.stripeCustomerId ?? null,
      currentTemporaryCreditAmount: Number(userBilling?.currentTemporaryCreditAmount ?? 0),
      currentTemporaryCreditExpiredAt: expiredAt ?? null,
      daysRemaining,
    };
  }

  async addPersistentCreditToUserWithTx(
    tx: any,
    userId: string,
    credits: number,
    reason: string
  ) {
    await tx
      .update(usersBilling)
      .set({
        currentPersistentCreditAmount: sql`${usersBilling.currentPersistentCreditAmount} + ${credits}`,
        lastStripeSyncAt: new Date(),
      })
      .where(eq(usersBilling.userId, userId));
    this.logger.info(`[BillingService] Added ${credits} persistent credits to user ${userId} for reason: ${reason}`);
  }

  async subtractPersistentCreditFromUserWithTx(
    tx: any,
    userId: string,
    credits: number,
    reason: string
  ) {
    await tx
      .update(usersBilling)
      .set({
        currentPersistentCreditAmount: sql`
          GREATEST(${usersBilling.currentPersistentCreditAmount} - ${credits}, 0)
        `,
        lastStripeSyncAt: new Date(),
      })
      .where(eq(usersBilling.userId, userId));

    this.logger.info(
      `[BillingService] Subtracted ${credits} persistent credits from user ${userId} for reason: ${reason}`
    );
  }

  async subtractTemporaryCreditFromUserWithTx(
    tx: any,
    userId: string,
    credits: number,
    reason: string
  ) {
    await tx
      .update(usersBilling)
      .set({
        currentTemporaryCreditAmount: sql`
          GREATEST(${usersBilling.currentTemporaryCreditAmount} - ${credits}, 0)
        `,
        lastStripeSyncAt: new Date(),
      })
      .where(eq(usersBilling.userId, userId));

    this.logger.info(
      `[BillingService] Subtracted ${credits} temporary credits from user ${userId} for reason: ${reason}`
    );
  }

  async updateTemporaryCreditInfoWithTx(
    tx: any,
    userId: string,
    credits: number,
    expiredAt: Date
  ) {
    await tx
      .update(usersBilling)
      .set({
        currentTemporaryCreditAmount: sql`${usersBilling.currentTemporaryCreditAmount} + ${credits}`,
        currentTemporaryCreditExpiredAt: expiredAt,
        lastStripeSyncAt: new Date(),
      })
      .where(eq(usersBilling.userId, userId));
    this.logger.info(`[BillingService] Added ${credits} temporary credits to user ${userId} expiring at ${expiredAt.toISOString()}`);
  }

  async getCurrentBillingAndStatsBillingInfo(userId: string) {
    const [userBilling] = await this.database
      .select({
        currentPersistentCreditAmount: usersBilling.currentPersistentCreditAmount,
        currentTemporaryCreditAmount: usersBilling.currentTemporaryCreditAmount,
      })
      .from(usersBilling)
      .where(eq(usersBilling.userId, userId))
      .limit(1);

    const currentMonth = new Date().toISOString().slice(0, 7);

    const [usageStats] = await this.database
      .select({
        totalCreditsUsed: sql<number>`COALESCE(SUM(${usageMonthlyStats.totalCredits}), 0)`,
        totalRequests: sql<number>`COALESCE(SUM(${usageMonthlyStats.requests}), 0)`,
      })
      .from(usageMonthlyStats)
      .where(
        and(
          eq(usageMonthlyStats.userId, userId),
          eq(usageMonthlyStats.month, currentMonth)
        )
      );

    const persistent = Number(userBilling?.currentPersistentCreditAmount ?? 0);
    const temporary = Number(userBilling?.currentTemporaryCreditAmount ?? 0);

    return {
      availableCredit: persistent + temporary,
      totalCreditsUsed: Number(usageStats?.totalCreditsUsed ?? 0),
      totalRequests: Number(usageStats?.totalRequests ?? 0),
      month: currentMonth,
    };
  }
}