
import { container } from 'tsyringe';
import { Hono } from "hono"
import { getOauthProviderMiddleware, parseUserInfoFromHandler } from "../../middlewares/get_oauth_middleware"
import { VineValidator } from '../../../shared/utils/vine-validator';
import { PublicAuthLoginParamsValidator, PublicAuthLoginQueriesValidator } from './auth.validator';
import { UserService } from "../user"
import { AuthService } from './auth.service';
import { Response } from '@shared/utils';
import { OverrideCookies } from '@shared/middlewares/override_cookies';

const publicAuthRouter = new Hono()

publicAuthRouter.get("/:provider/login",
    VineValidator("param", PublicAuthLoginParamsValidator),
    getOauthProviderMiddleware
);


publicAuthRouter.get(
    "/:provider/callback",
    VineValidator("param", PublicAuthLoginParamsValidator),
    VineValidator("query", PublicAuthLoginQueriesValidator),
    getOauthProviderMiddleware,
    OverrideCookies({
        secure: true,
        sameSite: 'None',
        maxAge: 60
    }),
    async (c) => {
        const userService = container.resolve(UserService)
        const authService = container.resolve(AuthService)

        const userInfo = parseUserInfoFromHandler(c.req.param('provider'), c)!

        const provider = c.req.param('provider');

        const user = await userService.findOrCreateUserFromSocial(provider, {
            id: userInfo.id,
            email: userInfo.email,
            displayName: userInfo.name,
            username: userInfo.username,
            profilePictureUrl: userInfo.profilePictureUrl,
        })

        const signed = await authService.generateAuthCredential(user!)

        return Response.success(c, {
            data: {
                ...signed,
                user: user,
            }
        })
    }
);




export default publicAuthRouter