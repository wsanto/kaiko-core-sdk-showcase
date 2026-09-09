import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

/**
 * CloudWatch Embedded Metric Format (EMF) middleware.
 * Emits structured metrics that CloudWatch automatically ingests
 * from Lambda logs without needing a CloudWatch SDK.
 */
export const MetricsMiddleware = () =>
  createMiddleware(async (c, next) => {
    const start = Date.now();

    await next();

    const duration = Date.now() - start;
    const statusCode = c.res.status;
    // Use the matched handler's route template (e.g. "/v2/emotions/:context_id/analysis")
    // not the resolved path — otherwise every unique userId becomes its own
    // CloudWatch metric and cardinality explodes.
    const path = routePath(c, -1);
    const method = c.req.method;

    // CloudWatch EMF log - automatically parsed by CloudWatch
    const emfLog = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Kaiko/EmotionAPI",
            Dimensions: [["Endpoint"], ["StatusCode"]],
            Metrics: [
              { Name: "RequestDuration", Unit: "Milliseconds" },
              { Name: "RequestCount", Unit: "Count" },
              { Name: "ErrorCount", Unit: "Count" },
            ],
          },
        ],
      },
      Endpoint: `${method} ${path}`,
      StatusCode: String(statusCode),
      RequestDuration: duration,
      RequestCount: 1,
      ErrorCount: statusCode >= 400 ? 1 : 0,
    };

    console.log(JSON.stringify(emfLog));
  });
