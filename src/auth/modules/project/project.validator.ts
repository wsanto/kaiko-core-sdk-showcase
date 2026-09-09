import vine from "@vinejs/vine";

export const createProjectValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1),
    isActive: vine.boolean().optional(),
    config: vine.object({}).nullable().optional(),
  })
);

export const updateProjectValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1).optional(),
    config: vine.object({}).nullable().optional(),
  })
);

export const projectParamsValidator = vine.compile(
  vine.object({
    id: vine.string().uuid(),
  })
);

export const projectListQueryValidator = vine.compile(
  vine.object({
    name: vine.string().optional(),
    isActive: vine.boolean().optional(),
  })
);

export const chartStatsQueryValidator = vine.compile(
  vine.object({
    type: vine.enum(['total', 'apiKey']),
    months: vine.number().min(1).max(24).optional(),
  })
);