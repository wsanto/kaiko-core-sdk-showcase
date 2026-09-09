import vine from "@vinejs/vine";

export const topUpValidator = vine.compile(
  vine.object({
    amount: vine.number(),
    payment_method_id: vine.string().optional(),
  })
);