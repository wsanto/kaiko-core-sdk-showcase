import { and, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { Database, stripePaymentMethods, usersBilling } from "../../db";
import {
    CreatePaymentMethodRequest,
    GetPaymentMethodsResponse,
    PaymentMethodCard,
    PaymentMethodIdeal,
    PaymentMethodResponse,
    PaymentMethodSepaDebit
} from "./types";

@autoInjectable()
export default class PaymentMethodsService {
    constructor(
        @inject("DB") private database: Database,
        @inject("LOGGER") private logger: Logger,
        @inject("STRIPE") private stripe: Stripe
    ) { }

    supportMethodType = ["card"]

    private extractPaymentMethodDetails(stripeMethod: Stripe.PaymentMethod): PaymentMethodCard | PaymentMethodSepaDebit | PaymentMethodIdeal | undefined {
        if (stripeMethod.type === 'card') {
            return {
                brand: stripeMethod.card?.brand ?? "",
                last4: stripeMethod.card?.last4 ?? "",
                expMonth: stripeMethod.card?.exp_month ?? 0,
                expYear: stripeMethod.card?.exp_year ?? 0,
            };
        } else if (stripeMethod.type === 'sepa_debit') {
            return {
                last4: stripeMethod.sepa_debit?.last4 ?? "",
                country: stripeMethod.sepa_debit?.country ?? "",
                bankCode: stripeMethod.sepa_debit?.bank_code ?? "",
            };
        } else if (stripeMethod.type === 'ideal') {
            return {
                bank: stripeMethod.ideal?.bank ?? "",
            };
        }
        return undefined;
    }

    async createPaymentMethod(userId: string, paymentMethodData: CreatePaymentMethodRequest): Promise<PaymentMethodResponse> {
        const customerId = await this.getOrCreateStripeCustomer(userId);
        const paymentMethodParams: Stripe.PaymentMethodCreateParams = {
            type: paymentMethodData.type as Stripe.PaymentMethodCreateParams.Type,
        };

        if (this.supportMethodType.includes(paymentMethodData.type)) {
            paymentMethodParams.card = {
                token: paymentMethodData.token,
            };
        } else {
            throw new Error(`Payment method type ${paymentMethodData.type} not supported for creation with token`);
        }

        const paymentMethod = await this.stripe.paymentMethods.create(paymentMethodParams);
        await this.stripe.paymentMethods.attach(paymentMethod.id, {
            customer: customerId,
        });

        await this.database.transaction(async (tx) => {
            if (paymentMethodData.isDefault) {
                await tx
                    .update(stripePaymentMethods)
                    .set({
                        metadata: sql`jsonb_set(metadata, '{isDefault}', 'false')`,
                    })
                    .where(
                        and(
                            eq(stripePaymentMethods.userId, userId),
                            sql`metadata ->> 'type' = ${paymentMethodData.type}`,
                            sql`metadata ->> 'isDefault' = 'true'`
                        )
                    );
            }

            await tx
                .insert(stripePaymentMethods)
                .values({
                    userId,
                    stripePaymentMethodId: paymentMethod.id,
                    metadata: {
                        isDefault: Boolean(paymentMethodData.isDefault),
                        type: paymentMethodData.type ?? "card",
                    },
                });
        });

        const cardDetails = this.extractPaymentMethodDetails(paymentMethod);

        return {
            id: paymentMethod.id,
            customerId,
            type: paymentMethodData.type ?? "card",
            card: cardDetails,
            metadata: {
                isDefault: Boolean(paymentMethodData.isDefault),
                type: paymentMethodData.type ?? "card",
            },
        };
    }

    async getPaymentMethods(
        userId: string,
        limit = 20,
        page = 1
    ): Promise<GetPaymentMethodsResponse> {
        const offset = (page - 1) * limit;
        const customerId = await this.getOrCreateStripeCustomer(userId);

        const [userPaymentMethods, totalCountResult] = await Promise.all([
            this.database
                .select()
                .from(stripePaymentMethods)
                .where(eq(stripePaymentMethods.userId, userId))
                .limit(limit)
                .offset(offset),
            this.database
                .select({ count: sql<number>`count(*)` })
                .from(stripePaymentMethods)
                .where(eq(stripePaymentMethods.userId, userId))
                .then((res) => Number(res[0]?.count || 0)),
        ]);

        if (userPaymentMethods.length === 0) {
            return {
                data: [],
                pagination: {
                    page,
                    limit,
                    total: 0,
                },
            };
        }

        const stripeIds = userPaymentMethods.map(pm => pm.stripePaymentMethodId);
        const stripeMethods = await Promise.allSettled(
            stripeIds.map(id => this.stripe.paymentMethods.retrieve(id))
        );

        const stripeMap = new Map<string, Stripe.PaymentMethod>();
        stripeMethods.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                stripeMap.set(stripeIds[index], result.value);
            } else {
                this.logger.error(`Failed to retrieve payment method ${stripeIds[index]}:`, result.reason);
            }
        });

        const data = userPaymentMethods.map(dbRecord => {
            const stripeMethod = stripeMap.get(dbRecord.stripePaymentMethodId);
            if (!stripeMethod) {
                return {
                    id: dbRecord.stripePaymentMethodId,
                    customerId,
                    type: dbRecord.metadata?.type || "unknown",
                    metadata: dbRecord.metadata || {},
                    isDeleted: true,
                };
            }
            const cardDetails = this.extractPaymentMethodDetails(stripeMethod);
            return {
                id: stripeMethod.id,
                customerId,
                type: stripeMethod.type,
                card: cardDetails,
                metadata: dbRecord.metadata || { isDefault: false, type: stripeMethod.type },
            };
        });

        return {
            data,
            pagination: {
                page,
                limit,
                total: totalCountResult,
            },
        };
    }

    async deletePaymentMethod(userId: string, paymentMethodId: string) {
        const userPaymentMethod = await this.database
            .select()
            .from(stripePaymentMethods)
            .where(
                and(
                    eq(stripePaymentMethods.userId, userId),
                    eq(stripePaymentMethods.stripePaymentMethodId, paymentMethodId)
                )
            )
            .limit(1);

        if (!userPaymentMethod.length) {
            throw new Error("Payment method not found or does not belong to user");
        }

        await this.database.transaction(async (tx) => {
            await tx
                .delete(stripePaymentMethods)
                .where(
                    and(
                        eq(stripePaymentMethods.userId, userId),
                        eq(stripePaymentMethods.stripePaymentMethodId, paymentMethodId)
                    )
                );

            try {
                await this.stripe.paymentMethods.detach(paymentMethodId);
            } catch (error) {
                this.logger.error(`Failed to detach payment method ${paymentMethodId} from Stripe:`, error);
            }
        });

        return {}
    }

    async setDefaultPaymentMethod(userId: string, paymentMethodId: string) {
        const userPaymentMethod = await this.database
            .select()
            .from(stripePaymentMethods)
            .where(
                and(
                    eq(stripePaymentMethods.userId, userId),
                    eq(stripePaymentMethods.stripePaymentMethodId, paymentMethodId)
                )
            )
            .limit(1);

        if (!userPaymentMethod.length) {
            throw new Error("Payment method not found or does not belong to user");
        }

        const paymentMethodType = userPaymentMethod[0].metadata?.type;
        await this.database.transaction(async (tx) => {
            await tx
                .update(stripePaymentMethods)
                .set({
                    metadata: sql`jsonb_set(metadata, '{isDefault}', 'false')`,
                })
                .where(
                    and(
                        eq(stripePaymentMethods.userId, userId),
                        sql`metadata ->> 'type' = ${paymentMethodType}`,
                        sql`metadata ->> 'isDefault' = 'true'`
                    )
                );

            await tx
                .update(stripePaymentMethods)
                .set({
                    metadata: sql`jsonb_set(metadata, '{isDefault}', 'true')`,
                })
                .where(
                    and(
                        eq(stripePaymentMethods.userId, userId),
                        eq(stripePaymentMethods.stripePaymentMethodId, paymentMethodId)
                    )
                );
        });
    }

    async getOrCreateStripeCustomer(userId: string): Promise<string> {
        const existing = await this.database
            .select({
                stripeCustomerId: usersBilling.stripeCustomerId,
            })
            .from(usersBilling)
            .where(eq(usersBilling.userId, userId))
            .limit(1);

        if (existing.length > 0 && existing[0].stripeCustomerId) {
            return existing[0].stripeCustomerId;
        }

        const newCustomer = await this.stripe.customers.create({
            metadata: { userId },
        });
        await this.database
            .insert(usersBilling)
            .values({
                userId,
                stripeCustomerId: newCustomer.id,
            })
            .onConflictDoUpdate({
                target: usersBilling.userId,
                set: { stripeCustomerId: newCustomer.id },
            });

        return newCustomer.id;
    }
}