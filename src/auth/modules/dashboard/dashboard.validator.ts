import vine from "@vinejs/vine";

export const chartQueryValidator = vine.compile(
  vine.object({
    months: vine.number().min(1).max(24).optional(),
  })
);