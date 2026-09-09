import vine from "@vinejs/vine";

export const usageLogPayloadValidator = vine.compile(
  vine.object({
    requestId: vine.string(),
    userId: vine.string().uuid(),
    apiKeyId: vine.string().uuid(),
    projectId: vine.string().uuid(),
    timestamp: vine.number(),
    metricCategory: vine.string(),
    metricName: vine.string(),
    value: vine.unionOfTypes([vine.string(), vine.number()]),
    metadata: vine.record(vine.any()).optional(),
  })
);

export const getUsageQueryValidator = vine.compile(
  vine.object({
    from: vine.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/).optional(),
    to: vine.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/).optional(),
    apiKeyId: vine.string().uuid().optional(),
    projectId: vine.string().uuid().optional(),
    metricCategory: vine.string().optional(),
    metricName: vine.string().optional(),
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
    sort: vine.string().regex(/^[a-zA-Z_]+:(asc|desc)(,[a-zA-Z_]+:(asc|desc))*$/).optional(),
    responseType: vine.enum(["total", "list"]).optional(),
    granularity: vine.enum(["daily", "monthly", "yearly"]).optional(),
  })
);
