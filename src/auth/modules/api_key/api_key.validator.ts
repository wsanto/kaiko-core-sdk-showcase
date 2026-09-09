import vine from "@vinejs/vine";

export const projectParamsValidator = vine.compile(
  vine.object({
    project_id: vine.string().uuid(),
  })
);

export const projectApiKeyParamsValidator = vine.compile(
  vine.object({
    project_id: vine.string().uuid(),
    id: vine.string().uuid(),
  })
);

export const projectApiKeyCreateBodyValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(3).maxLength(100),
    keyTypeId: vine.string().uuid().optional(),
    metadata: vine.object({
      description: vine.string().optional(),
    }).optional(),
  })
);

export const projectApiKeyListQueryValidator = vine.compile(
  vine.object({
    name: vine.string().optional(),
    typeId: vine.string().uuid().optional(),
    isActive: vine.boolean().optional(),
  })
);


export const apiKeyListQueryValidator = vine.compile(
  vine.object({
    name: vine.string().optional(),
    projectId: vine.string().optional(),
    typeId: vine.string().uuid().optional(),
    isActive: vine.boolean().optional(),
  })
);

export const apiKeyUpdateBodyValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1).maxLength(255).optional(),
    keyTypeId: vine.string().uuid().optional(),
    metadata: vine.object({
      description: vine.string().optional(),
    }).optional(),
    isActive: vine.boolean().optional(),
  })
);
