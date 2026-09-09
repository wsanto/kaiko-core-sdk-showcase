import { container } from "tsyringe";
import { Hono } from "hono";
import { VineValidator } from "@shared/utils";
import { UserService } from "./user.service";
import { userUpdateBodyValidator } from "./user.validator";
import { camelToSnakeObject } from "@shared/utils/case-converter";
import { ParseGatewayDataMiddleware } from "@shared/middlewares";
import { Response } from "@shared/utils";
import { user } from "@auth/db";

const userRouter = new Hono();

userRouter.get(
  "me",
  ParseGatewayDataMiddleware(),
  async (c) => {
  const userService = container.resolve(UserService);

  const id = c.get("userId")!;
  const user = await userService.getById(id);

  if (!user) {
    return Response.error(c, {
      message: "User not found",
      code: 404,
    });
  }

  return Response.success(c, {
    data: user,
  });
});

userRouter.put(
  "me",
  ParseGatewayDataMiddleware(),
  VineValidator("json", userUpdateBodyValidator),
  async (c) => {
    const userService = container.resolve(UserService);

    const id = c.get("userId");
    const body = c.req.valid("json") as {
      user?: Partial<typeof user.$inferInsert>;
      metadata?: Partial<typeof user.$inferInsert>;
    };

    const data = await userService.update(id!, body);

    if (!data) {
      return Response.error(c, {
        message: "User not found",
        code: 404
      });
    }

    return Response.success(c, {
      data: camelToSnakeObject(data)
    });
  }
);


export default userRouter;
