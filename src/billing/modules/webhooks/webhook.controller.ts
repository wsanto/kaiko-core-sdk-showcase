import { logger } from "@shared/logger";
import { Hono } from "hono";
import { Bindings } from "hono/types";
import Stripe from "stripe";
import { container } from "tsyringe";
import WebhookService from "./webhook.service";

const webhookRouter = new Hono<{ Bindings: Bindings }>();
const webhookService = container.resolve(WebhookService);

webhookRouter.post("/", async (c) => {
    const payload = await c.req.text();
    const signature = c.req.header("stripe-signature");
    const env = process.env.API_KEY_ENV;

    logger.info(`➡️ Incoming webhook request (env=${env})`);

    let event: Stripe.Event;
    if (env === "local") {
        try {
            event = JSON.parse(payload);
        } catch (err) {
            return c.json({ error: "Invalid JSON payload" }, 400);
        }
    } else {
        if (!signature) {
            return c.json({ error: "Missing stripe-signature header" }, 400);
        }

        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error("STRIPE_WEBHOOK_SECRET is not configured.");
            return c.json({ error: "Webhook secret not configured" }, 500);
        }
        event = Stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    }

    await webhookService.handleEvent(event);
    return c.json({ received: true });
});

export default webhookRouter;