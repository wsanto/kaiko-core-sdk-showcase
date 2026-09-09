import * as winston from "winston";

export const logger = winston.createLogger({
  level: "debug",
  format: winston.format.json(),
  defaultMeta: { service: "emotion-api" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});
