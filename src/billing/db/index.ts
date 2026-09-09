import { drizzle } from 'drizzle-orm/node-postgres';
import { billingItems } from './schema/billing_items';
import { billings } from './schema/billings';
import { invoices } from './schema/invoices';
import { plans } from './schema/plans';
import { stripePaymentMethods } from './schema/stripe_payment_method';
import { usageLogs } from './schema/usage_log';
import { usageMonthlyStats } from './schema/usage_monthly_stats';
import { userLedger } from './schema/user_ledger';
import { userSubscriptions } from './schema/user_subscriptions';
import { usersBilling } from './schema/users_billing';

export const createDB = () => {
    const DATABASE_URL = process.env.DATABASE_URL;
    const db = drizzle(DATABASE_URL!, {
        schema: {
            usageLogs,
            billings,
            invoices,
            usersBilling,
            billingItems,
            stripePaymentMethods,
            plans,
            userSubscriptions,
            userLedger,
            usageMonthlyStats
        },
    });

    return db;
}
export type Database = ReturnType<typeof createDB>;

export {
    billingItems, billings,
    invoices, plans, stripePaymentMethods, usageLogs, usageMonthlyStats, userLedger, usersBilling, userSubscriptions
};

