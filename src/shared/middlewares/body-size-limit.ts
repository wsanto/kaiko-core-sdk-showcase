import { createMiddleware } from "hono/factory";

/**
 * Request body size limit middleware.
 *
 * Rejects requests with bodies exceeding the configured limit.
 * Prevents DoS attacks via oversized payloads and reduces
 * Lambda memory pressure and LLM token cost exposure.
 *
 * Default: 1 MB (1_048_576 bytes)
 */

const DEFAULT_MAX_BODY_SIZE = 1_048_576; // 1 MB

export const BodySizeLimitMiddleware = (maxBytes: number = DEFAULT_MAX_BODY_SIZE) =>
    createMiddleware(async (c, next) => {
        // Check Content-Length header first (fast path)
        const contentLength = c.req.header("content-length");
        if (contentLength) {
            const length = parseInt(contentLength, 10);
            if (!isNaN(length) && length > maxBytes) {
                return c.json(
                    {
                        status: "error",
                        code: "PAYLOAD_TOO_LARGE",
                        message: `Request body exceeds maximum size of ${maxBytes} bytes`,
                    },
                    413
                );
            }
        }

        // For requests without Content-Length (chunked transfer),
        // read the body and check actual size
        if (c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "PATCH") {
            try {
                const body = await c.req.text();
                if (body.length > maxBytes) {
                    return c.json(
                        {
                            status: "error",
                            code: "PAYLOAD_TOO_LARGE",
                            message: `Request body exceeds maximum size of ${maxBytes} bytes`,
                        },
                        413
                    );
                }
            } catch {
                // If body reading fails, let downstream handlers deal with it
            }
        }

        await next();
    });
