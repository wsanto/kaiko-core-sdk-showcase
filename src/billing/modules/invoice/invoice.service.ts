import { buildPaginationMeta, getPagination } from "@shared/utils/query/pagination";
import { desc, eq, inArray, sql } from "drizzle-orm";
import Stripe from "stripe";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { billingItems, billings, Database, invoices } from "../../db";

type Billing = typeof billings.$inferSelect;
type BillingItem = typeof billingItems.$inferSelect;

@autoInjectable()
export default class InvoiceService {
  constructor(
    @inject("DB") private database: Database,
    @inject("LOGGER") private logger: Logger,
    @inject("STRIPE") private stripe: Stripe
  ) { }

  async getInvoices(params: {
    userId: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, page = 1, limit = 20 } = params;
    const { offset } = getPagination({ page, limit });

    const invoiceRecords = await this.database
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.database
      .select({ count: sql<number>`COUNT(*)` })
      .from(invoices)
      .where(eq(invoices.userId, userId));

    const billingIds = invoiceRecords
      .map((inv) => inv.billingId)
      .filter((id): id is string => !!id);

    let billingRecords: Billing[] = [];
    let allItems: BillingItem[] = [];

    if (billingIds.length > 0) {
      billingRecords = await this.database
        .select()
        .from(billings)
        .where(inArray(billings.id, billingIds));

      allItems = await this.database
        .select()
        .from(billingItems)
        .where(inArray(billingItems.billingId, billingIds));
    }

    const billingMap = new Map(
      billingRecords.map((billing) => [billing.id, billing])
    );

    const itemsMap = new Map(
      allItems.reduce((map, item) => {
        const key = item.billingId;
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key)!.push(item);
        return map;
      }, new Map<string, BillingItem[]>())
    );

    const data = invoiceRecords.map((inv) => {
      const billing = billingMap.get(inv.billingId || "");
      const items = itemsMap.get(inv.billingId || "") || [];

      return {
        id: inv.id,
        createdAt: inv.createdAt?.toISOString() ?? null,
        paymentInfo: inv.paymentInfo,
        userId: inv.userId,
        taxRatio: Number(inv.taxRatio ?? 0),
        taxAmount: Number(inv.taxAmount ?? 0),
        totalAmount: Number(inv.totalAmount ?? 0),
        status: inv.status,
        stripeInvoiceId: inv.stripeInvoiceId,
        billing: billing
          ? {
            projectId: billing.projectId,
            userId: billing.userId,
            period: billing.period
              ? {
                start: billing.period.lower
                  ? new Date(billing.period.lower).toISOString()
                  : null,
                end: billing.period.upper
                  ? new Date(billing.period.upper).toISOString()
                  : null,
              }
              : null,
            items: items.map((item) => ({
              category: item.category,
              name: item.name,
              metadata: item.metadata,
              quantity: item.quantity,
              billingId: item.billingId,
              unitPrice: Number(item.unitPrice ?? 0),
            })),
          }
          : null,
      };
    });

    return {
      data,
      pagination: buildPaginationMeta(Number(count), page, limit),
    };
  }
}