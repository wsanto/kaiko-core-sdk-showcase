import { Response } from "@shared/utils";
import { createMiddleware } from "hono/factory";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60; // 60 requests per minute per API key

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 300_000);

export const RateLimiterMiddleware = (limit: number = MAX_REQUESTS) =>
  createMiddleware(async (c, next) => {
    const apiKeyId = c.get("apiKeyId") as string | undefined;
    if (!apiKeyId) {
      await next();
      return;
    }

    const now = Date.now();
    let entry = store.get(apiKeyId);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      store.set(apiKeyId, entry);
    }

    entry.count++;

    c.res.headers.set("X-RateLimit-Limit", String(limit));
    c.res.headers.set("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
    c.res.headers.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > limit) {
      return Response.error(c, {
        code: 429,
        message: "Rate limit exceeded. Please retry after the reset window.",
      });
    }

    await next();
  });
