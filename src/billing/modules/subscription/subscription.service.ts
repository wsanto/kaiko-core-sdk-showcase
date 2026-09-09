import { and, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { Database, plans, stripePaymentMethods, userSubscriptions } from "../../db";
import { PaymentMethodsService } from "../payment_methods";
import { CreateSubscriptionRequest, CreateSubscriptionResponse, SubscriptionMetadata, SubscriptionWithPlan, UserPlansResponse } from "./types";

@autoInjectable()
export default class SubscriptionService {
    constructor(
        @inject("DB") private database: Database,
        @inject("LOGGER") private logger: Logger,
        @inject("STRIPE") private stripe: Stripe,
        @inject(PaymentMethodsService) private paymentMethodsService: PaymentMethodsService
    ) { }

    async createSubscription(
        userId: string,
        data: CreateSubscriptionRequest
    ): Promise<CreateSubscriptionResponse> {
        const existingActiveSub = await this.database
            .select()
            .from(userSubscriptions)
            .where(
                and(
                    eq(userSubscriptions.userId, userId),
                    eq(userSubscriptions.status, "active")
                )
            )
            .limit(1);

        if (existingActiveSub.length > 0) {
            throw new Error("You already have an active subscription.");
        }

        const customerId = await this.paymentMethodsService.getOrCreateStripeCustomer(userId);

        const defaultPaymentMethod = await this.database
            .select({ stripePaymentMethodId: stripePaymentMethods.stripePaymentMethodId })
            .from(stripePaymentMethods)
            .where(
                and(
                    eq(stripePaymentMethods.userId, userId),
                    sql`metadata ->> 'isDefault' = 'true'`
                )
            )
            .limit(1);

        if (defaultPaymentMethod.length < 1) {
            throw new Error("Please add a default payment method.");
        }

        const stripePaymentMethodId = defaultPaymentMethod[0].stripePaymentMethodId;

        await this.stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: stripePaymentMethodId },
        });

        const plan = await this.database.query.plans.findFirst({
            where: eq(plans.id, data.planId),
        });

        if (!plan) {
            throw new Error("Plan not found.");
        }

        let stripePriceId = plan.stripePriceId;

        if (!stripePriceId || stripePriceId.toUpperCase().includes("NULL")) {
            const price = await this.stripe.prices.create({
                unit_amount: Math.round(Number(plan.amount) * 100),
                currency: "usd",
                recurring: {
                    interval: plan.periodType as "day" | "week" | "month" | "year",
                },
                product_data: {
                    name: plan.name,
                    metadata: {
                        planId: plan.id,
                        credits: plan.credits?.toString() ?? "0",
                    },
                },
            });

            stripePriceId = price.id;

            await this.database
                .update(plans)
                .set({ stripePriceId })
                .where(eq(plans.id, plan.id));

            this.logger.info(
                `[SubscriptionService] Created new Stripe Price ${stripePriceId} for plan ${plan.name}`
            );
        }

        const metadata: SubscriptionMetadata = {
            userId,
            planId: plan.id,
            planName: plan.name,
            stripePaymentMethodId,
            credits: plan.credits?.toString() ?? "0",
            createdBy: "createSubscription()",
        };
        const subscription = await this.stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: stripePriceId }],
            payment_behavior: "default_incomplete",
            payment_settings: { save_default_payment_method: "on_subscription" },
            expand: ["latest_invoice.payment_intent"],
            metadata: metadata,
        });

        this.logger.info(
            `[SubscriptionService] Created subscription ${subscription.id} for user ${userId} (plan ${plan.name})`
        );

        return {
            id: subscription.id,
            stripeSubscriptionId: subscription.id,
        };
    }


    async cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<void> {
        await this.stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
        });
    }

    async cancelSubscriptionImmediately(subscriptionId: string): Promise<void> {
        try {
            await this.stripe.subscriptions.cancel(subscriptionId);
        } catch (err: unknown) {
            if (err instanceof Error && err.message?.includes("No such subscription")) {
                this.logger.warn(`[Subscription] ${subscriptionId} already canceled or not found.`);

                await this.database
                    .update(userSubscriptions)
                    .set({
                        status: "canceled",
                    })
                    .where(eq(userSubscriptions.stripeSubId, subscriptionId));
            } else {
                throw err;
            }
        }
    }

    async getCurrentUserSubscription(
        userId: string
    ): Promise<SubscriptionWithPlan | null> {
        const subs = await this.database
            .select({
                id: userSubscriptions.id,
                status: userSubscriptions.status,
                periodStart: userSubscriptions.periodStart,
                periodEnd: userSubscriptions.periodEnd,
                stripeSubId: userSubscriptions.stripeSubId,
                plan: {
                    id: plans.id,
                    name: plans.name,
                    amount: plans.amount,
                    periodType: plans.periodType,
                    credits: plans.credits,
                },
            })
            .from(userSubscriptions)
            .leftJoin(plans, eq(userSubscriptions.planId, plans.id))
            .where(
                and(
                    eq(userSubscriptions.userId, userId),
                    eq(userSubscriptions.status, "active")
                )
            )
            .limit(1);
        const subscription = subs.length > 0 ? subs[0] : null;
        return subscription;
    }


    async getAllPlans(userId: string): Promise<UserPlansResponse> {
        const activeSub = await this.database
            .select({ planId: userSubscriptions.planId, id: userSubscriptions.id, stripeSubId: userSubscriptions.stripeSubId })
            .from(userSubscriptions)
            .where(
                and(
                    eq(userSubscriptions.userId, userId),
                    eq(userSubscriptions.status, "active")
                )
            ).limit(1);

        const [active] = activeSub;
        const currentPlanId = active?.planId ?? null;
        const result = await this.database.select().from(plans);

        const formatted = result.map(plan => ({
            id: plan.id,
            name: plan.name,
            stripePriceId: plan.stripePriceId,
            amount: plan.amount,
            periodType: plan.periodType,
            credits: plan.credits,
            isCurrent: plan.id === currentPlanId,
            subscription: active && active.planId === plan.id
                ? {
                    id: active.id ?? null,
                    stripeSubId: active.stripeSubId ?? null,
                }
                : null,
        }));

        return formatted;
    }
}