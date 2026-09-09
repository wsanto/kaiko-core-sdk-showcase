import "core-js";
import { GlobalErrorHandler } from "@shared/middlewares/error";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import "./module";
import { ApiKeyRouter, ProjectApiKeyRouter } from "./modules/api_key";
import publicAuthRouter from "./modules/auth/public-auth.controller";
import { ProjectRouter } from "./modules/project";
import { UserRouter } from "./modules/user";
import { showRoutes } from 'hono/dev'
import { DashboardRouter } from "./modules/dashboard";

dayjs.extend(duration);

const app = new Hono({ strict: false });

app.use(cors({
  origin: "*",
  allowHeaders: ["*"],
  allowMethods: ["*"],
  credentials: true
}))

app.onError(GlobalErrorHandler);

app.get("", async (c) => c.json({ data: "OK!" }));

// Health check endpoint for internal service discovery
app.get("/health", async (c) => c.json({
  status: "healthy",
  service: "auth-api",
  timestamp: new Date().toISOString()
}));

const v1 = new Hono();

v1.route("public/auth", publicAuthRouter);

v1.route("/users", UserRouter);

v1.route("/projects", ProjectRouter);

v1.route("/projects/:project_id/api-keys", ProjectApiKeyRouter);
v1.route("/api-keys", ApiKeyRouter);

v1.route("/users/dashboard", DashboardRouter);

app.route("v1", v1);

showRoutes(app, {
  verbose: process.env.NODE_ENV !== 'production',
})

export const handler = handle(app);
