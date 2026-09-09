import vine from "@vinejs/vine";

export const getMonthlyStatsValidator = vine.compile(
    vine.object({
        userId: vine.string(),
        months: vine
            .array(vine.string().regex(/^\d{4}-\d{2}$/))
            .minLength(1)
            .maxLength(12),
    })
);

export const getProjectUsageValidator = vine.compile(
    vine.object({
        userId: vine.string().uuid(),
        projectId: vine.string().uuid(),
        month: vine.string().optional(),
    })
);


export const getProjectMonthlyStatsValidator = vine.compile(
    vine.object({
        userId: vine.string().uuid(),
        projectId: vine.string().uuid(),
        months: vine.array(vine.string().regex(/^\d{4}-\d{2}$/)),
    })
);

export const getApiKeyMonthlyStatsValidator = vine.compile(
    vine.object({
        userId: vine.string().uuid(),
        projectId: vine.string().uuid(),
        months: vine.array(vine.string().regex(/^\d{4}-\d{2}$/)),
    })
);

export const getApiKeysUsageValidator = vine.compile(
    vine.object({
        apiKeyIds: vine
            .array(vine.string().uuid())
            .minLength(1)
            .maxLength(100),
    })
);

export const getProjectsUsageValidator = vine.compile(
    vine.object({
        projectIds: vine
            .array(vine.string().uuid())
            .minLength(1)
            .maxLength(100),
    })
);