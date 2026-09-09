import Stripe from "stripe";
import { container } from "tsyringe";
import * as winston from "winston";
import { createDB, Database } from "./db";

let db: Database;
let logger: winston.Logger;
let stripe: Stripe;

container.register("DB", {
    useFactory: () => {
        return db ||= createDB();
    }
})

container.register("LOGGER", {
    useFactory: () => {
        return logger ||= winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            defaultMeta: { service: 'kaiko-billing-api' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                }),
            ],
        });
    }
})

container.register("STRIPE", {
    useFactory: () => {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) {
            throw new Error("STRIPE_SECRET_KEY environment variable is not set!");
        }
        return stripe ||= new Stripe(stripeKey, {
            apiVersion: "2025-10-29.clover"
        });
    }
});