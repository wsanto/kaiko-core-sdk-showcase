import vine from "@vinejs/vine";

export const createPaymentMethodValidator = vine.compile(
  vine.object({
    token: vine.string(),
    type: vine.string(),
    is_default: vine.boolean().optional(),
  })
);

export const getPaymentMethodsValidator = vine.compile(
  vine.object({
    limit: vine.number().min(1).max(100).optional(),
    page: vine.number().min(1).optional(),
  })
);