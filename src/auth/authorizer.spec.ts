import "core-js";
import { container } from 'tsyringe';

import { beforeAll, expect, test, mock } from "bun:test";
import { handler } from "./authorizer"
import { APIGatewayProxyEvent, Context } from "aws-lambda"
import { beforeEach } from "node:test";
import { ApiService } from "./modules/api_key";
import { AuthService } from "./modules/auth/auth.service";

let event = {
    headers: {}
} as unknown as APIGatewayProxyEvent;

let context = {} as Context;

let mockApiService: ApiService;
let mockAuthService: AuthService;

beforeAll(() => {
    container.reset();
})

beforeEach(() => {
    event = {
        headers: {}
    } as unknown as APIGatewayProxyEvent;

    context = {} as Context;

    // Initialize mocks
    mockApiService = {
        verifyApiKey: mock().mockReturnValue(null),
    } as unknown as ApiService;

    mockAuthService = {
        validateAndClaimAccessToken: mock(() => Promise.reject(new Error("Invalid token"))),
    } as unknown as AuthService;
})

test("No Token Provided", async () => {
    container.registerInstance(ApiService, mockApiService);
    container.registerInstance(AuthService, mockAuthService);

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(false);
    expect(result?.context?.err).toBe("Key Not Found");
});

test("Bearer Token Provided - Valid JWT", async () => {
    const validJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const mockValidAuthService = {
        validateAndClaimAccessToken: mock().mockReturnValue(Promise.resolve({ userId: "1234567890" })),
    } as unknown as AuthService;

    container.registerInstance(ApiService, mockApiService);
    container.registerInstance(AuthService, mockValidAuthService);

    event.headers = {
        Authorization: `Bearer ${validJwt}`
    };

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(true);
    expect(result?.context?.userId).toBe("1234567890");
    expect(mockValidAuthService.validateAndClaimAccessToken).toHaveBeenCalledWith(validJwt);
});

test("Bearer Token Provided - Invalid JWT", async () => {
    const invalidJwt = "eyJinvalid";

    container.registerInstance(ApiService, mockApiService);
    container.registerInstance(AuthService, mockAuthService);

    event.headers = {
        Authorization: `Bearer ${invalidJwt}`
    };

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(false);
    expect(result?.context?.err).toBe("Invalid Bearer Token");
});

test("Malformed API Key Provided", async () => {
    container.registerInstance(ApiService, mockApiService);
    container.registerInstance(AuthService, mockAuthService);

    event.headers = {
        Authorization: "sk_invalidkey"
    };

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(false);
    expect(result?.context?.err).toBe("Malformed API Key");
});

test("Invalid API Key Provided", async () => {
    container.registerInstance(ApiService, mockApiService);
    container.registerInstance(AuthService, mockAuthService);

    event.headers = {
        Authorization: "sk_env_invalidapikey"
    };

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(false);
    expect(result?.context?.err).toBe("Invalid Key");
});

test("Valid API Key Provided", async () => {
    const validApiKey = "sk_env_validapikey";
    const apiKeyRecord = { id: 1, userId: "user-123" };
    const validApiService = {
        verifyApiKey: mock().mockReturnValue(Promise.resolve(apiKeyRecord)),
    } as unknown as ApiService;

    container.registerInstance(ApiService, validApiService);
    container.registerInstance(AuthService, mockAuthService);

    event.headers = {
        Authorization: validApiKey
    };

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(true);
    expect(result?.context?.apiKeyId).toBe(apiKeyRecord.id);
    expect(result?.context?.userId).toBe(apiKeyRecord.userId);
    expect(validApiService.verifyApiKey).toHaveBeenCalledWith("validapikey");
});

test("Valid Production API Key - sk_prod_1YhEyO2Qi26RSdjUgoOurUnFnRVwPQv8", async () => {
    const prodApiKey = "sk_prod_1YhEyO2Qi26RSdjUgoOurUnFnRVwPQv8";
    const apiKeyRecord = { id: 42, userId: "prod-user-456" };
    const validApiService = {
        verifyApiKey: mock().mockReturnValue(Promise.resolve(apiKeyRecord)),
    } as unknown as ApiService;

    container.registerInstance(ApiService, validApiService);
    container.registerInstance(AuthService, mockAuthService);

    event.headers = {
        Authorization: prodApiKey
    };

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(true);
    expect(result?.context?.apiKeyId).toBe(apiKeyRecord.id);
    expect(result?.context?.userId).toBe(apiKeyRecord.userId);
    // Verify that the API key part (after env prefix) is correctly extracted and passed to verifyApiKey
    expect(validApiService.verifyApiKey).toHaveBeenCalledWith("1YhEyO2Qi26RSdjUgoOurUnFnRVwPQv8");
});

test("API Key from x-api-key header", async () => {
    const apiKey = "sk_test_somevalidkey";
    const apiKeyRecord = { id: 10, userId: "test-user-789" };
    const validApiService = {
        verifyApiKey: mock().mockReturnValue(Promise.resolve(apiKeyRecord)),
    } as unknown as ApiService;

    container.registerInstance(ApiService, validApiService);
    container.registerInstance(AuthService, mockAuthService);

    event.headers = {
        "x-api-key": apiKey
    };

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(true);
    expect(result?.context?.apiKeyId).toBe(apiKeyRecord.id);
    expect(result?.context?.userId).toBe(apiKeyRecord.userId);
    expect(validApiService.verifyApiKey).toHaveBeenCalledWith("somevalidkey");
});

test("Unknown Token Type Provided", async () => {
    container.registerInstance(ApiService, mockApiService);
    container.registerInstance(AuthService, mockAuthService);

    event.headers = {
        Authorization: "unknown_token"
    };

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(false);
    expect(result?.context?.err).toBe("Unknown Token Type");
});

test("Internal Server Error handling", async () => {
    const errorApiService = {
        verifyApiKey: mock().mockImplementation(() => {
            throw new Error("Database error");
        }),
    } as unknown as ApiService;

    container.registerInstance(ApiService, errorApiService);
    container.registerInstance(AuthService, mockAuthService);

    event.headers = {
        Authorization: "sk_test_validkey"
    };

    const result = await handler(event, context);

    expect(result.isAuthorized).toBe(false);
    expect(result?.context?.err).toBe("Internal Server Error");
});
