import Stripe from "stripe";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { Database } from "../../db";
import { InvoiceService } from "./invoice_event_handel.service";
import { PlanService } from "./plan_event_handel.service";
import { SubscriptionService } from "./subscription_event_handel.service";

@autoInjectable()
export default class WebhookService {
    constructor(
        @inject("DB") private database: Database,
        @inject("LOGGER") private logger: Logger,
        @inject("STRIPE") private stripe: Stripe,
        @inject(InvoiceService) private invoiceService: InvoiceService,
        @inject(SubscriptionService) private subscriptionService: SubscriptionService,
        @inject(PlanService) private planService: PlanService
    ) { }

    async handleEvent(event: Stripe.Event) {
        this.logger.info(`Received Stripe webhook: type=${event.type}, id=${event.id}`);
        const data = event.data;

        switch (event.type) {
            // Delegate cho PlanService
            case 'product.created':
                await this.planService.handleProductCreated(data.object as Stripe.Product);
                break;
            case 'product.updated':
                await this.planService.handleProductUpdated({
                    object: data.object as Stripe.Product,
                    previous_attributes: data.previous_attributes ?? {}
                });
                break;
            case 'product.deleted':
                await this.planService.handleProductDeleted(data.object as Stripe.Product);
                break;
            case 'price.created':
                await this.planService.handlePriceCreated(data.object as Stripe.Price);
                break;
            case 'price.updated':
                await this.planService.handlePriceUpdated({
                    object: data.object as Stripe.Price,
                    previous_attributes: data.previous_attributes ?? {}
                });
                break;
            case 'price.deleted':
                await this.planService.handlePriceDeleted(data.object as Stripe.Price);
                break;

            // Delegate cho SubscriptionService
            case 'customer.subscription.created':
                await this.subscriptionService.handleSubscriptionCreated(event);
                break;
            case 'customer.subscription.updated':
                await this.subscriptionService.handleSubscriptionUpdated(event);
                break;
            case 'customer.subscription.deleted':
                await this.subscriptionService.handleSubscriptionDeleted(event);
                break;

            // Delegate cho InvoiceService
            case 'invoice.created':
                await this.invoiceService.handleInvoiceCreated(data.object as Stripe.Invoice);
                break;
            case 'invoice.payment_succeeded':
                await this.invoiceService.handleInvoicePaymentSucceeded(data.object as Stripe.Invoice);
                break;
            case 'invoice.payment_failed':
                await this.invoiceService.handleInvoicePaymentFailed(data.object as Stripe.Invoice);
                break;
            case 'charge.succeeded':
                await this.invoiceService.handleChargeSucceeded(data.object as Stripe.Charge);
                break;

            default:
                this.logger.info(`Unhandled event type: ${event.type}`);
        }
    }
}