import { SnakeToCamelObject } from "@shared/utils";
import { chatCompletionValidator } from "./chat.validator";
import { ApiRequestParams } from "@shared/types/request";
import { RawEmotionScores } from "../emotion/types";

export type ChatCompletionResponse = {
    id: string;
    object: "chat.completion";
    created: number;
    model: ChatCompletionBody["model"];
    emotionModel?: string;
    choices: Array<{
        index: number;
        message: {
            role: "assistant";
            content: string;
        };
        finishReason: "stop";
    }>;
    emotions: {
        user: {
            text: string;
            category: string;
            raw: RawEmotionScores;
        };
        assistant: {
            text: string;
            category: string;
            raw: RawEmotionScores;
        };
    };
    usage: {
        promptTokens: number;
        completionTokens: number;
        analyseTokens: number;
        totalTokens: number;
    };
};

export type ChatCompletionBody = SnakeToCamelObject<Awaited<ReturnType<typeof chatCompletionValidator["validate"]>>>;


export interface HandleChatCompletionParams extends ApiRequestParams {
    body: ChatCompletionBody;
}