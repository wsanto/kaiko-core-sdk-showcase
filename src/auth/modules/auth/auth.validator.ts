import vine from "@vinejs/vine";

export const PublicAuthLoginParamsValidator = vine.compile(
    vine.object({
        provider: vine.enum(['twitter', 'google', 'facebook']),
    })
)

export const PublicAuthLoginQueriesValidator = vine.compile(
    vine.object({
        redirect_url: vine.string().url({
            require_protocol: true,
            protocols: ['http','https'],
            require_tld: false
        }).optional()
    }).toCamelCase()
)