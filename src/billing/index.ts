import "core-js";
import { ParseGatewayDataMiddleware, ParseRequestIdMiddleware } from "@shared/middlewares";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import "./module";
import { BillingRouter } from "./modules/billing";
import { InvoiceRouter } from "./modules/invoice";
import { PaymentMethodsRouter } from "./modules/payment_methods";
import { SubscriptionRouter } from "./modules/subscription";
import { UsageRouter } from "./modules/usage";
import webhookRouter from "./modules/webhooks/webhook.controller";
import { cors } from "hono/cors";
import { GlobalErrorHandler } from "@shared/middlewares/error";
import { BillingInternalRouter } from "./modules/billing-internal";


const app = new Hono({ strict: false });

app.use(cors({
  origin: "*",
  allowHeaders: ["*"],
  allowMethods: ["*"],
  credentials: true
}))

app.onError(GlobalErrorHandler);

// Health check endpoint for internal service discovery
app.get("/health", async (c) => c.json({
  status: "healthy",
  service: "billing-api",
  timestamp: new Date().toISOString()
}));

app.route("/v1/billing/webhook", webhookRouter);
app.route("/v1/billing/internal", BillingInternalRouter); // TODO: add auth middleware for production

const v1 = new Hono();
v1.use(ParseRequestIdMiddleware(), ParseGatewayDataMiddleware())

v1.route("/billing", BillingRouter);
v1.route("/billing/payment-methods", PaymentMethodsRouter);
v1.route("/billing/subscriptions", SubscriptionRouter);
v1.route("/billing/invoices", InvoiceRouter);
v1.route("/billing/usage", UsageRouter);
app.route("/v1", v1);

export const handler = handle(app);