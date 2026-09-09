import { Env } from "hono";
import { setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { Cookie } from "hono/utils/cookie";
const parseSetCookies = (setCookies: string) => {
    const cookies: Cookie = {};
    setCookies.split(',').forEach(str => {

        const [name, value] = str.split(';')[0].split('=');

        cookies[name.trim()] = value.trim();
    })
    return cookies;
}
export const OverrideCookies = (params: {
    secure?: boolean
    httpOnly?: boolean
    sameSite?: 'Lax' | 'Strict' | 'None'
    path?: string,
    maxAge?: number
}) => createMiddleware<Env>((c, next) => {
    const cookieHeader = c.res.headers.get("Set-Cookie");

    if (!cookieHeader) {
        return next();
    }

    const cookies = parseSetCookies(cookieHeader);
    c.res.headers.delete("Set-Cookie");
    Object.entries(cookies).forEach(([name, value]) => {
        setCookie(c, name, value, {
            secure: params.secure ?? true,
            httpOnly: params.httpOnly ?? false,
            sameSite: params.sameSite ?? 'Lax',
            maxAge: params.maxAge ?? 600,
        })
    })
    return next();
})