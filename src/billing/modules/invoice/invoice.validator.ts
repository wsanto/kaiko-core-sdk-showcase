import vine from "@vinejs/vine";

export const getInvoicesQueryValidator = vine.compile(
    vine.object({
        page: vine.number().min(1).optional(),
        limit: vine.number().min(1).max(100).optional(),
    })
);