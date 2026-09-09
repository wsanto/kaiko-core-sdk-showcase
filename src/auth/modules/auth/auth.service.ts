import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";
import { user as userSchema } from "@auth/db";
import * as  jose from 'jose'
import dayjs from "dayjs"
@autoInjectable()
export class AuthService {
    accessTokenSecret: Uint8Array<ArrayBuffer>
    refreshTokenSecret: Uint8Array<ArrayBuffer>
    accessTokenExpiredDuration: number
    refreshTokenExpiredDuration: number
    issuer: string = 'auth::kaiko'
    aud: string = 'user'

    constructor(@inject("DB") private database: NodePgDatabase, @inject("LOGGER") private logger: Logger) {
        if (process.env.JWT_SECRET_KEY) {
            this.accessTokenSecret = new TextEncoder().encode(
                process.env.JWT_SECRET_KEY,
            )
        } else {
            logger.error("JWT_SECRET_KEY is not set.");
        }

        if (process.env.JWT_REFRESH_KEY) {
            this.refreshTokenSecret = new TextEncoder().encode(
                process.env.JWT_REFRESH_KEY,
            )
        } else {
            logger.warn("JWT_REFRESH_KEY is not set.");
        }

        if (process.env.JWT_SECRET_EXPIRES_IN) {
            this.accessTokenExpiredDuration = dayjs.duration(process.env.JWT_SECRET_EXPIRES_IN || "PT24H").asSeconds();

        } else {
            logger.warn("JWT_SECRET_EXPIRES_IN is not set.");
        }
        if (process.env.JWT_REFRESH_EXPIRES_IN) {
            this.refreshTokenExpiredDuration = dayjs.duration(process.env.JWT_REFRESH_EXPIRES_IN || "PT168H").asSeconds();
        } else {
            logger.warn("JWT_SECRET_EXPIRES_IN is not set.");
        }
    }

    async generateAuthCredential(user: typeof userSchema.$inferSelect) {
        const dateNow = dayjs();

        const accessTokenExpired = dateNow.add(this.accessTokenExpiredDuration, "seconds");

        const refreshTokenExpired = dateNow.add(this.refreshTokenExpiredDuration, "seconds");

        const payload: jose.JWTPayload = {
            iss: this.issuer,
            sub: user.id,
            aud: this.aud,
            iat: dateNow.unix(),
        }

        const protectionHeader: jose.JWTHeaderParameters = {
            alg: 'HS256',
            typ: 'JWT'
        }

        const accessTokenID = crypto.randomUUID();

        const refreshTokenID = crypto.randomUUID();

        const accessToken = await new jose.SignJWT({
            ...payload,
            jti: accessTokenID,
            exp: accessTokenExpired.unix(),
        }).setProtectedHeader(protectionHeader).sign(this.accessTokenSecret)

        const refreshAccessToken = await new jose.SignJWT({
            ...payload,
            jti: refreshTokenID,
            exp: refreshTokenExpired.unix(),
        }).setProtectedHeader(protectionHeader).sign(this.refreshTokenSecret)

        // TODO: cached in redis to revoke them.

        return {
            accessToken: accessToken,
            accessTokenExpired: accessTokenExpired.unix(),
            refreshAccessToken: refreshAccessToken,
            refreshTokenExpired: refreshTokenExpired.unix(),
        }
    }

    async validateAndClaimAccessToken(accessToken: string): Promise<{ userId: string; }> {
        const { payload } = await jose.jwtVerify(accessToken, this.accessTokenSecret, {
            issuer: this.issuer,
            audience: this.aud,
        })

        // TODO: validate if refresh token revoked

        return {
            userId: payload.sub!,
        }
    }
}