import vine from "@vinejs/vine";
import { Infer } from "@vinejs/vine/types";

export const chatCompletionValidator = vine.compile(
  vine.object({
    model: vine.string().maxLength(64),
    emotion_model: vine.string().maxLength(64),
    context_id: vine.string().maxLength(128).optional(),
    messages: vine.array(
      vine.object({
        role: vine.enum(["user", "assistant"]),
        content: vine.string().maxLength(10000),
      })
    ).maxLength(100),
    model_params: vine
      .object({
        temperature: vine.number().optional(),
      })
      .optional(),
    emotion_model_params: vine
      .object({
        granularity: vine.enum(["detailed", "basic"]).optional(),
      })
      .optional(),
    stream_options: vine.boolean().optional(),
    tools: vine.array(vine.string().maxLength(256)).maxLength(20).optional(),
  })
);

export type ChatCompletionBody = Infer<typeof chatCompletionValidator>;
