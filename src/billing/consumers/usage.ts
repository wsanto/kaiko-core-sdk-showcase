import "core-js";
import "../module";
import { container } from "tsyringe";
import { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { Logger } from "winston";
import { UsageLogBody } from "../modules/usage";
import { UsageService } from "../modules/usage";
import { usageLogPayloadValidator } from "@billing/modules/usage";
import { VineParseStringify } from "@shared/utils/vine-parser";

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const logger = container.resolve<Logger>("LOGGER");
    const usageService = container.resolve(UsageService);

    logger.info("Processing SQS event", {
        recordCount: event.Records.length,
        source: "aws:sqs",
    });

    const failedMessageIds: string[] = [];
    const successfullyParsedIds: string[] = [];
    const parsedBodies: UsageLogBody[] = [];

    for (const record of event.Records) {
        try {
            const validatedBody = await VineParseStringify(record.body, usageLogPayloadValidator);
            parsedBodies.push(validatedBody);
            successfullyParsedIds.push(record.messageId);
        } catch (err) {
            logger.error("Failed to parse record body", {
                messageId: record.messageId,
                body: record.body,
                error: err,
            });
            failedMessageIds.push(record.messageId);
        }
    }

    if (parsedBodies.length > 0) {
        await usageService.createUsageLogs(parsedBodies).catch((err) => {
            logger.error("Failed to create usage logs", {
                error: err,
            });
            failedMessageIds.push(...successfullyParsedIds);
        });
    }

    return {
        batchItemFailures: failedMessageIds.map((id) => ({ itemIdentifier: id })),
    };
};
