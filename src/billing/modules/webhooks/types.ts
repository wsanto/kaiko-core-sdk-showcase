export type UpdateSubscriptionData = {
    userId: string;
    planId: string;
    planChargeAmount: string;
    status: "active" | "canceled" | "payment_error";
    error?: string | null;
    periodStart: Date;
    periodEnd: Date;
    updatedAt: Date;
};

export type InsertSubscriptionData = UpdateSubscriptionData & {
    stripeSubId: string;
    createdAt: Date;
};