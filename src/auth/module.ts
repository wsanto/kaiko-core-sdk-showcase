import { container } from 'tsyringe';

import { createDB, Database } from "./db";

import * as winston from "winston"

let db: Database;
let logger: winston.Logger;

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
            defaultMeta: { service: 'kaiko-auth-api' },
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