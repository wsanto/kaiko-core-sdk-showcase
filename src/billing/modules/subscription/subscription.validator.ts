import vine from "@vinejs/vine";

export const createSubscriptionValidator = vine.compile(
    vine.object({
        plan_id: vine.string(),
    })
);