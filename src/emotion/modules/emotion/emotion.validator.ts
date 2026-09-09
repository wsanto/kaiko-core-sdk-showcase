import vine from "@vinejs/vine";
import { Infer } from "@vinejs/vine/types";

export const analyseEmotionValidator = vine.compile(
  vine.object({
    model: vine.string(),
    params: vine
      .object({})
      .optional(),
    messages: vine.array(
      vine.object(
        {
          role: vine.string().maxLength(32).optional(),
          externalId: vine.string().uuid().optional(),
          content: vine.object({
            audioUrl: vine.string().maxLength(2048).optional(),
            text: vine.string().maxLength(10000),
          }),
          timestamp: vine.string().maxLength(64).optional(),
        }
      ),
    ).maxLength(100)
  })
);

export type AnalyseEmotionBody = Infer<typeof analyseEmotionValidator>;
