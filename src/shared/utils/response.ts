import { Context } from "hono";
import { ContentfulStatusCode, ContentlessStatusCode } from "hono/utils/http-status";
import { camelToSnakeObject } from "./case-converter";

export namespace Response {
    export function success(c: Context, { code = 200, data, disableCaseCasting }: { code?: ContentfulStatusCode; data?: any, disableCaseCasting?: boolean }) {
        if (Number(code) === 204) return c.body(null, code);
        if (disableCaseCasting) return c.json(data, code);
        const payload = Array.isArray(data)
            ? data.map((item: any) =>
                item && typeof item === "object" && !Array.isArray(item) ? camelToSnakeObject(item) : item
            ) : camelToSnakeObject(data);

        return c.json(payload, code);
    }

    export function error(c: Context, { code = 500, message = "Internal Server Error", details }: { code?: ContentfulStatusCode; message?: string, details?: any }) {
        return c.json({ message, details }, code);
    }
}
