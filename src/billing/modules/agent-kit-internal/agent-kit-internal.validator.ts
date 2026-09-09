import vine from "@vinejs/vine";

export const verifyApiKeyValidator = vine.compile(
  vine.object({
    apiKey: vine.string().minLength(20),
  })
);

export const logUsageValidator = vine.compile(
  vine.object({
    apiKeyId: vine.string().uuid(),
    projectId: vine.string().uuid(),
    userId: vine.string().uuid(),
    metric: vine.string().minLength(1),
    value: vine.number().min(0),
    requestId: vine.string().uuid().optional(),
    endUserId: vine.string().optional(),
    metadata: vine.any().optional(),
  })
);

export const registerEndUserValidator = vine.compile(
  vine.object({
    projectId: vine.string().uuid(),
    externalUserId: vine.string().minLength(1).maxLength(255),
  })
);

export const getEndUserStatsValidator = vine.compile(
  vine.object({
    projectId: vine.string().uuid(),
    month: vine.string().optional(), // Format: YYYY-MM-DD
  })
);
