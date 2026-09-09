import { TOPUP_CREDITS_RATE, TOPUP_TYPE } from '@shared/constants';
import { createTsRange } from '@shared/types/tsrange';
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { autoInjectable, inject } from "tsyringe";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "winston";
import { Database, billingItems, billings, invoices, usersBilling } from "../../db";
import BillingService from "../billing/billing.service";
import { SubscriptionMetadata } from '../subscription';

@autoInjectable()
export class InvoiceService {
  constructor(
    @inject("DB") private database: Database,
    @inject("LOGGER") private logger: Logger,
    @inject("STRIPE") private stripe: Stripe,
    @inject(BillingService) private billingService: BillingService
  ) { }

  async handleInvoiceCreated(invoice: Stripe.Invoice) {
    const stripeCustomerId = invoice.customer as string;
    if (!stripeCustomerId) {
      this.logger.warn("[InvoiceService] invoice.created missing customer");
      return;
    }

    const userRecord = await this.database
      .select({ userId: usersBilling.userId })
      .from(usersBilling)
      .where(eq(usersBilling.stripeCustomerId, stripeCustomerId))
      .limit(1);

    if (userRecord.length === 0) {
      this.logger.warn(`[InvoiceService] No user found for ${stripeCustomerId}`);
      return;
    }

    const userId = userRecord[0].userId;
    const projectId = "00000000-0000-0000-0000-000000000001";
    const lineItems = invoice.lines?.data ?? [];

    if (lineItems.length === 0) {
      this.logger.warn("[InvoiceService] No line items in invoice");
      return;
    }

    const firstLine = lineItems[0]; // TODO : only support first line for now
    const periodStart = firstLine.period?.start
      ? new Date(firstLine.period.start * 1000)
      : new Date();
    const periodEnd = firstLine.period?.end
      ? new Date(firstLine.period.end * 1000)
      : new Date();

    const period = createTsRange(periodStart, periodEnd);
    const now = new Date();
    const status = invoice.status ?? "draft";

    await this.database.transaction(async (tx) => {
      // Insert billing
      const billingId = uuidv4();
      await tx.insert(billings).values({
        id: billingId,
        projectId,
        userId,
        period,
      });

      // Insert billing items
      const metadata = firstLine.metadata as SubscriptionMetadata | undefined;
      await tx.insert(billingItems).values({
        id: uuidv4(),
        category: "subscription",
        name: firstLine.description ?? "Unknown item",
        metadata: metadata ?? {},
        quantity: firstLine.quantity ?? 1,
        billingId,
        unitPrice: ((firstLine.amount ?? 0) / 100).toFixed(6),
      });

      // Update temporary credit info
      await this.billingService.updateTemporaryCreditInfoWithTx(
        tx,
        userId,
        metadata?.credits ? parseFloat(metadata.credits) : 0,
        periodEnd
      );

      // Insert invoice
      const totalAmount = ((invoice.total ?? 0) / 100).toFixed(6);
      await tx.insert(invoices).values({
        id: uuidv4(),
        billingId,
        userId,
        createdAt: now,
        paymentInfo: JSON.parse(JSON.stringify(invoice)),
        taxRatio: (0).toFixed(4),
        taxAmount: (0).toFixed(6),
        totalAmount: totalAmount,
        status,
        stripeInvoiceId: invoice.id,
      });
    });


    this.logger.info(
      `[InvoiceService] Created billing + invoice for ${stripeCustomerId} (status: ${status}, period: ${periodStart.toISOString()} → ${periodEnd.toISOString()})`
    );
  }

  async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    await this.database
      .update(invoices)
      .set({
        status: 'paid',
        paymentInfo: JSON.parse(JSON.stringify(invoice)),
      })
      .where(eq(invoices.stripeInvoiceId, invoice.id));

    this.logger.info(`[InvoiceService] Updated invoice ${invoice.id} to paid with latest payment info`);
  }

  async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    await this.database
      .update(invoices)
      .set({
        status: 'failed',
        paymentInfo: JSON.parse(JSON.stringify(invoice)),
      })
      .where(eq(invoices.stripeInvoiceId, invoice.id));

    this.logger.info(`[InvoiceService] Updated invoice ${invoice.id} to failed with latest payment info`);
  }

  async handleChargeSucceeded(charge: Stripe.Charge) {
    const metadata = charge.metadata;
    if (!metadata || metadata.type !== TOPUP_TYPE) {
      return;
    }

    const userId = metadata.userId;
    if (!userId) {
      this.logger.warn("[InvoiceService] charge.succeeded missing userId in metadata");
      return;
    }

    const now = new Date();
    const totalAmount = ((charge.amount ?? 0) / 100).toFixed(6);
    const creditsToAdd = parseFloat(totalAmount) * TOPUP_CREDITS_RATE;

    await this.database.transaction(async (tx) => {
      await tx.insert(invoices).values({
        id: uuidv4(),
        billingId: null,
        userId,
        createdAt: now,
        paymentInfo: JSON.parse(JSON.stringify(charge)),
        taxRatio: (0).toFixed(4),
        taxAmount: (0).toFixed(6),
        totalAmount,
        status: "paid",
        stripeInvoiceId: null,
      });

      await this.billingService.addPersistentCreditToUserWithTx(
        tx,
        userId,
        creditsToAdd,
        TOPUP_TYPE
      );
      this.logger.info(
        `[InvoiceService] Created top-up invoice + credited ${creditsToAdd} to user ${userId}, amount ${totalAmount}`
      );
    });
  }
}
