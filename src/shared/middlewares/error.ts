import { ErrorHandler } from "hono";
import { container } from "tsyringe";
import { Logger } from "winston";

export const GlobalErrorHandler: ErrorHandler = (err, c) => {
    const logger = container.resolve<Logger>("LOGGER");

    logger.error(`Error occurred: ${err.message}`, {
        stack: err.stack,
        name: err.name,
        message: err.message,
        url: c.req.url,
    });

    return c.json(
        {
            status: "error",
            message: err.message || "Internal Server Error",
        },
        500
    );
};