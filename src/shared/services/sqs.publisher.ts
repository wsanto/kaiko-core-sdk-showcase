import {
    SQSClient,
    GetQueueUrlCommand,
    SendMessageCommand,
    SendMessageBatchCommand,
} from "@aws-sdk/client-sqs";
import { Stringify } from "@shared/utils/stringify";
import { Logger } from "winston";

export class QueuePublisher<T extends Record<string, any>> {
    private sqsClient: SQSClient;
    private queueUrl?: string;

    // Note: regions are auto-set in Lambda
    constructor(private queueName?: string, private logger?: Logger, private region?: string) {
        this.sqsClient = new SQSClient({ region: this.region || process.env.AWS_REGION || "us-east-1" });

        if (!this.queueName) {
            (this.logger || console)?.warn(
                `Initialized QueuePublisher without a queueName in region: ${this.region || process.env.AWS_REGION || "us-east-1"}`
            );
        } else {
            (this.logger || console)?.info(
                `Initialized QueuePublisher for queue: ${this.queueName} in region: ${this.region || process.env.AWS_REGION || "us-east-1"}`
            );
        }
    }

    private async resolveQueueUrl(): Promise<string> {
        if (this.queueUrl) return this.queueUrl;
        const res = await this.sqsClient.send(
            new GetQueueUrlCommand({ QueueName: this.queueName })
        );
        if (!res.QueueUrl) throw new Error("Unable to resolve SQS queue URL");
        this.queueUrl = res.QueueUrl;
        return this.queueUrl;
    }

    async publish(message: T): Promise<void> {
        const url = await this.resolveQueueUrl();
        const body = Stringify(message);
        await this.sqsClient.send(
            new SendMessageCommand({
                QueueUrl: url,
                MessageBody: body,
            })
        );
    }

    async batchPublish(messages: T[]): Promise<void> {
        if (!messages.length) return;
        const url = await this.resolveQueueUrl();

        // SQS batch max 10 entries
        for (let i = 0; i < messages.length; i += 10) {
            const chunk = messages.slice(i, i + 10);
            const entries = chunk.map((m, idx) => ({
                Id: String(idx),
                MessageBody: Stringify(m),
            }));

            await this.sqsClient.send(
                new SendMessageBatchCommand({
                    QueueUrl: url,
                    Entries: entries,
                })
            ).catch((err) => {
                this.logger?.error("Error sending SQS batch:", err) || console.error("Error sending SQS batch:", err);
            });
        }
    }
}