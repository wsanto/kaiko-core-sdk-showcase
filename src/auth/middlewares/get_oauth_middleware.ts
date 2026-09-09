import { xAuth } from "@hono/oauth-providers/x"
import { googleAuth } from "@hono/oauth-providers/google"
import { Context, Env } from "hono"
import { createMiddleware } from "hono/factory"
import { Response } from "@shared/utils"
import { OverrideCookies } from "@shared/middlewares/override_cookies"

export const getOauthMiddleware = (provider: string, redirectUrl?: string) => {
    switch (provider) {
        case 'twitter': {
            // Note that: confirmed_email, and users.email are currently not support by the library. So we must case the whose array into any.
            // Track this Issue: https://github.com/honojs/middleware/issues/1439
            const baseCallbackUrl = process.env.BASE_CALLBACK_URL;
            const twitterClientId = process.env.TWITTER_CLIENT_ID;
            const twitterClientSecret = process.env.TWITTER_CLIENT_SECRET;
            if (!baseCallbackUrl || !twitterClientId || !twitterClientSecret) {
                throw new Error("Missing Twitter OAuth environment variables");
            }

            return xAuth({
                fields: ["id", "name", "username", "profile_image_url", "confirmed_email"] as any,
                scope: ["users.read", "tweet.read", "users.email"] as any,
                client_id: twitterClientId,
                client_secret: twitterClientSecret,
                redirect_uri: redirectUrl || `${baseCallbackUrl}/v1/public/auth/twitter/callback`
            })
        }

        case "google": {
            const baseCallbackUrl = process.env.BASE_CALLBACK_URL;
            const googleClientId = process.env.GOOGLE_CLIENT_ID;
            const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
            if (!baseCallbackUrl || !googleClientId || !googleClientSecret) {
                throw new Error("Missing Google OAuth environment variables");
            }

            return googleAuth({
                client_id: googleClientId,
                client_secret: googleClientSecret,
                redirect_uri: redirectUrl || `${baseCallbackUrl}/v1/public/auth/google/callback`,
                scope: ["openid", "email", "profile"],
            })
        }
    }
}


export const getOauthProviderMiddleware = createMiddleware<Env, ":provider">(async (c, next) => {
    const { provider } = c.req.param()
    const redirectUrl = c.req.header("X-Redirect-Url") || undefined

    const middleware = getOauthMiddleware(provider, redirectUrl);

    if (!middleware) {
        return Response.error(c, {
            message: 'Unsupported provider',
            code: 400
        })
    }

    const mid = await middleware!(c, next)

    OverrideCookies({
        secure: true,
        sameSite: 'None',
        maxAge: 60
    })(c, async () => { });

    if (mid && mid.status == 302 && c.req.header("Accept") == "application/json") {
        return Response.success(c, {
            code: 200,
            data: {
                redirectUrl: mid.headers.get("Location")
            }
        })
    }


    return mid;
})

export const parseUserInfoFromHandler = (provider: string, context: Context) => {
    switch (provider) {
        case 'twitter': {
            const user = context.get('user-x')

            return {
                id: user!.id!,
                email: (user as any)!.confirmed_email as string,
                name: user!.name,
                username: user!.username,
                profilePictureUrl: user!.profile_image_url,
            }
        }

        case 'google': {
            const user = context.get('user-google')

            return {
                id: user!.id!,
                email: user!.email!,
                name: user!.name,
                username: user!.email?.split('@')[0],
                profilePictureUrl: user!.picture,
            }
        }
    }
}