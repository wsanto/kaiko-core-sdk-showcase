import { snakeToCamelObject } from "@shared/utils";
import { Logger } from "winston";

export class ApiClientError extends Error {
    constructor(
        message: string,
        public status?: number,
        public responseText?: string
    ) {
        super(message);
        this.name = "ApiClientError";
    }
}

interface ApiClientConfig {
    baseUrl: string;
    timeout?: number;
}

interface ApiRequestOptions extends RequestInit {
    timeout?: number;
}

export abstract class BaseApiClient {
    protected readonly baseUrl: string;
    protected readonly defaultTimeout: number;

    constructor(
        protected logger: Logger,
        config?: ApiClientConfig | string,
        private readonly basePath: string = ""
    ) {
        let rawBaseUrl: string;

        if (typeof config === "string") {
            rawBaseUrl = config;
            this.defaultTimeout = 10000;
        } else {
            rawBaseUrl =
                config?.baseUrl ||
                this.getDefaultBaseUrl();
            this.defaultTimeout = config?.timeout || 10000;
        }
        this.baseUrl = this.normalizeBaseUrl(rawBaseUrl) + this.basePath;
    }

    protected abstract getDefaultBaseUrl(): string;

    private normalizeBaseUrl(url: string): string {
        return url.replace(/\/+$/, "") + "/";
    }

    protected async callApi<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
        const url = new URL(path, this.baseUrl);
        const timeout = options.timeout || this.defaultTimeout;

        const config: RequestInit = {
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
            ...options,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        config.signal = controller.signal;

        try {
            const response = await fetch(url.toString(), config);
            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorBody = "";
                try {
                    errorBody = await response.text();
                } catch { }
                throw new ApiClientError(
                    `HTTP error! status: ${response.status}`,
                    response.status,
                    errorBody
                );
            }

            const contentType = response.headers.get("content-type");
            if (!contentType?.includes("application/json")) {
                throw new ApiClientError(`Invalid response type: ${contentType}`);
            }

            const data = await response.json();
            return snakeToCamelObject(data) as T;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof ApiClientError) {
                this.logger.error(`${this.constructor.name} API error:`, {
                    path,
                    status: error.status,
                    message: error.message,
                    url: url.toString(),
                });
                throw error;
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            const isAbortError = error instanceof Error && error.name === "AbortError";

            this.logger.error(`${this.constructor.name} API call failed:`, {
                path,
                error: errorMessage,
                url: url.toString(),
                timeout: isAbortError ? timeout : undefined,
            });

            throw new ApiClientError(
                isAbortError
                    ? `API request timed out after ${timeout}ms: ${url.toString()}`
                    : `Failed to call API at ${url.toString()}: ${errorMessage}`
            );
        }
    }
}
