import vine from "@vinejs/vine";

export const idParamsValidator = vine.compile(
  vine.object({
    id: vine.string().uuid(),
  }).toCamelCase()
);

export const userUpdateBodyValidator = vine.compile(
  vine.object({
    user: vine.object({
      display_name: vine.string().minLength(3).maxLength(30).optional(),
      avatar_url: vine.string().optional(),
    }).optional(),
    metadata: vine.object({}).optional(),
  }).toCamelCase()
);