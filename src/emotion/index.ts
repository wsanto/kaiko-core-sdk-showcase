import "core-js";
import { ParseRequestIdMiddleware, ParseGatewayDataMiddleware } from "@shared/middlewares";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import "./module";
import { ChatRouter, ChatV2Router } from "./modules/chat";
import { EmotionRouter, EmotionV2Router } from "./modules/emotion";
import { cors } from 'hono/cors'
import { GlobalErrorHandler } from "@shared/middlewares/error";
import { RateLimiterMiddleware } from "./middlewares/rate-limiter";
import { MetricsMiddleware } from "./middlewares/metrics";


const app = new Hono({ strict: false });

app.use(cors({
  origin: "*",
  allowHeaders: ["*"],
  allowMethods: ["*"],
  credentials: true
}))

app.onError(GlobalErrorHandler);

app.use(MetricsMiddleware(), ParseRequestIdMiddleware(), ParseGatewayDataMiddleware(), RateLimiterMiddleware())

// V1 Routes (DEPRECATED - sunset March 31, 2026)
// Both V1 and V2 are fully operational with billing/token tracking
// See: docs/API_MIGRATION_GUIDE.md for migration instructions
const v1 = new Hono();

// Add deprecation headers to all V1 routes
v1.use("*", async (c, next) => {
  await next();
  // RFC 8594 Deprecation header
  c.res.headers.set("Deprecation", "true");
  // Sunset header indicating when V1 will be removed
  c.res.headers.set("Sunset", "Tue, 31 Mar 2026 00:00:00 GMT");
  // Link to successor version
  c.res.headers.set("Link", '</v2>; rel="successor-version"');
  // Custom header with migration guide URL
  c.res.headers.set("X-API-Migration-Guide", "https://docs.kaikostudios.xyz/migration/v1-to-v2");
});

v1.route("/emotions", EmotionRouter);
v1.route("/chat", ChatRouter);
app.route("/v1", v1);

// V2 Routes (new - with enhanced EQ analysis)
const v2 = new Hono();
v2.route("/emotions", EmotionV2Router);
v2.route("/chat", ChatV2Router);

app.route("/v2", v2);

export const handler = handle(app);
