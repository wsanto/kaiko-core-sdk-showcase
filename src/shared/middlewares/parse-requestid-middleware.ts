import { createMiddleware } from "hono/factory"

export const ParseRequestIdMiddleware = () =>
    createMiddleware<{
        Variables: {
            requestId: string
        }
    }>(async (c, next) => {
        const requestId = (c.env as any).requestContext?.requestId
        if (requestId) {
            c.set("requestId", requestId)
        }
        await next()
    })
