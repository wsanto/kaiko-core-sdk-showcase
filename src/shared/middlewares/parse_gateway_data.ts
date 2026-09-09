import { createMiddleware } from 'hono/factory'

export const ParseGatewayDataMiddleware = () => createMiddleware<{
    Variables: {
        userId?: string,
        apiKeyId?: string,
        projectId?: string,
    }
}>(async (c, next) => {
    const env = c.env as any

    // Try multiple paths for authorizer context (different API Gateway configurations)
    // 1. HTTP API with Lambda authorizer (CDK style): requestContext.authorizer.lambda
    // 2. HTTP API with simple responses: requestContext.authorizer (direct)
    // 3. REST API style: requestContext.authorizer
    const authorizerContext =
        env?.requestContext?.authorizer?.lambda ||
        env?.requestContext?.authorizer ||
        {}

    // Fallback to headers for backward compatibility (e.g., direct Lambda invocation)
    const userId = authorizerContext?.userId || c.req.header('GATEWAY_USER_ID') || c.req.header('gateway-user-id')
    const apiKeyId = authorizerContext?.apiKeyId || c.req.header('GATEWAY_API_KEY_ID') || c.req.header('gateway-api-key-id')
    const projectId = authorizerContext?.projectId || c.req.header('GATEWAY_PROJECT_ID') || c.req.header('gateway-project-id')

    if (userId) {
        c.set("userId", userId)
    }
    if (apiKeyId) {
        c.set("apiKeyId", apiKeyId)
    }
    if (projectId) {
        c.set("projectId", projectId)
    }
    await next()
})
