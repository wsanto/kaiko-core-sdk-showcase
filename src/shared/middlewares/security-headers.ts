import { createMiddleware } from "hono/factory";

/**
 * Security headers middleware for API responses.
 *
 * Adds standard security headers to all responses to mitigate:
 * - Clickjacking (X-Frame-Options)
 * - MIME-type sniffing (X-Content-Type-Options)
 * - XSS attacks (X-XSS-Protection)
 * - Information leakage (X-Powered-By removal)
 * - Cache poisoning (Cache-Control for API responses)
 */
export const SecurityHeadersMiddleware = () =>
    createMiddleware(async (c, next) => {
        await next();

        // Prevent clickjacking
        c.res.headers.set("X-Frame-Options", "DENY");

        // Prevent MIME-type sniffing
        c.res.headers.set("X-Content-Type-Options", "nosniff");

        // Enable XSS filter in older browsers
        c.res.headers.set("X-XSS-Protection", "1; mode=block");

        // Strict referrer policy
        c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

        // Prevent caching of API responses containing sensitive data
        c.res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        c.res.headers.set("Pragma", "no-cache");

        // Remove server identification
        c.res.headers.delete("X-Powered-By");
        c.res.headers.delete("Server");

        // Permissions policy - restrict browser features
        c.res.headers.set(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()"
        );
    });
