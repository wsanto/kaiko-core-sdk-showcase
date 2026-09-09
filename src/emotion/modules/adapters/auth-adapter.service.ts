import { snakeToCamelObject } from "@shared/utils";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";

export class AuthApiError extends Error {
    constructor(
        message: string,
        public status?: number,
        public responseText?: string
    ) {
        super(message);
        this.name = "AuthApiError";
    }
}

interface AuthClientConfig {
    baseUrl: string;
    timeout?: number;
}

interface ApiRequestOptions extends RequestInit {
    timeout?: number;
}

export interface ApiKeyStatusResponse {
    apiKey: { id: string; name: string | null; isActive: boolean | null };
    project: { id: string; name: string; isActive: boolean };
    isPaused: boolean;
    reason: string | null;
}

@autoInjectable()
export default class AuthAdapterService {
    private readonly baseUrl: string;
    private readonly defaultTimeout: number;

    constructor(
        @inject("LOGGER") private logger: Logger,
        config?: AuthClientConfig | string
    ) {
        let rawBaseUrl: string;

        if (typeof config === "string") {
            rawBaseUrl = config;
            this.defaultTimeout = 10000;
        } else {
            rawBaseUrl =
                config?.baseUrl ||
                process.env.AUTH_API_BASE_URL ||
                "http://127.0.0.1:3000/dev/v1";
            this.defaultTimeout = config?.timeout || 10000;
        }
        this.baseUrl = this.normalizeBaseUrl(rawBaseUrl);
    }

    private normalizeBaseUrl(url: string): string {
        return url.replace(/\/+$/, "") + "/";
    }

    private async callApi<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
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
                } catch { /* ignore parse error */ }
                throw new AuthApiError(
                    `HTTP error! status: ${response.status}`,
                    response.status,
                    errorBody
                );
            }

            const contentType = response.headers.get("content-type");
            if (!contentType?.includes("application/json")) {
                throw new AuthApiError(`Invalid response type: ${contentType}`);
            }

            const data = await response.json();
            return snakeToCamelObject(data) as T;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof AuthApiError) {
                this.logger.error("Auth API error:", {
                    service: "auth-adapter",
                    path,
                    status: error.status,
                    message: error.message,
                    responseText: error.responseText,
                    fullUrl: url.toString(),
                    baseUrl: this.baseUrl,
                });
                throw error;
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            const isAbortError = error instanceof Error && error.name === "AbortError";

            this.logger.error("Error calling Auth API:", {
                service: "auth-adapter",
                path,
                error: errorMessage,
                fullUrl: url.toString(),
                baseUrl: this.baseUrl,
                timeout: isAbortError ? timeout : undefined,
                errorType: isAbortError ? "timeout" : "connection",
            });

            throw new AuthApiError(
                isAbortError
                    ? `Auth API request timed out after ${timeout}ms: ${url.toString()}`
                    : `Failed to call Auth API at ${url.toString()}: ${errorMessage}`
            );
        }
    }

    async checkApiKeyStatus(apiKeyId: string): Promise<ApiKeyStatusResponse> {
        if (!apiKeyId) throw new Error("API key ID is required");

        const result = await this.callApi<ApiKeyStatusResponse>(`api-keys/${apiKeyId}/status`, {
            method: "GET",
        });

        return result;
    }
}
