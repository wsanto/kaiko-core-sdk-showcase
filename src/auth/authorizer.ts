import "core-js";
import "./module";
import { APIGatewayProxyEvent } from 'aws-lambda';
import { container } from "tsyringe";
import { ApiService } from "./modules/api_key";
import { AuthService } from "./modules/auth/auth.service";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
dayjs.extend(duration);

interface AuthorizerResponse {
    isAuthorized: boolean;
    context?: Record<string, any>;
}

export const handler = async (
    event: APIGatewayProxyEvent,
): Promise<AuthorizerResponse> => {
    const apiService = container.resolve(ApiService);
    const authService = container.resolve(AuthService);
    try {
        const token = getTokenFromHeaders(event.headers);

        if (!token) {
            return unauthorized("Key Not Found");
        }

        const normalizedToken = normalizeToken(token);

        if (isBearerToken(normalizedToken)) {
            const result = await authService.validateAndClaimAccessToken(normalizedToken).catch(() => undefined);
            if (!result) return unauthorized("Invalid Bearer Token");
            return authorized({ userId: result.userId });
        } else if (isApiKey(normalizedToken)) {
            const parsed = parseApiKey(normalizedToken);
            if (!parsed) return unauthorized("Malformed API Key");

            const apiKeyRecord = await apiService.verifyApiKey(parsed.apiKey);
            if (!apiKeyRecord) return unauthorized("Invalid Key");

            return authorized({
                apiKeyId: apiKeyRecord.id,
                projectId: apiKeyRecord.projectId,
                userId: apiKeyRecord.project.userId,
            });
        } else {
            return unauthorized("Unknown Token Type");
        }

    } catch {
        return unauthorized("Internal Server Error");
    }
};

function getTokenFromHeaders(headers: Record<string, string | undefined>): string | undefined {
    return (
        headers["Authorization"] ||
        headers["x-api-key"] ||
        headers["authorization"]
    );
}

function normalizeToken(key: string): string {
    if (key.toLowerCase().startsWith("bearer ")) {
        return key.slice(7).trim();
    }
    return key.trim();
}

function isBearerToken(key: string): boolean {
    return key.startsWith("eyJ");
}

function isApiKey(key: string): boolean {
    return key.startsWith("sk_");
}

function parseApiKey(key: string): { env: string; apiKey: string } | null {
    const match = key.match(/^sk_([^_]+)_(.+)$/);
    if (!match) return null;
    const [, env, apiKey] = match;
    return { env, apiKey };
}

function unauthorized(err: string): AuthorizerResponse {
    return {
        isAuthorized: false,
        context: { err },
    };
}

function authorized(data: Record<string, string | number | undefined>): AuthorizerResponse {
    return {
        isAuthorized: true,
        context: data
    };
}
