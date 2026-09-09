import { Response, VineValidator } from "@shared/utils";
import type { AppEnv } from "@shared/types/hono-env";
import { Hono } from "hono";
import { container } from "tsyringe";
import PaymentMethodsService from "./payment_methods.service";
import { createPaymentMethodValidator, getPaymentMethodsValidator } from "./payment_methods.validator";

const paymentMethodsRouter = new Hono<AppEnv>();
const paymentMethodsService = container.resolve(PaymentMethodsService);

paymentMethodsRouter.post("/", VineValidator("json", createPaymentMethodValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const paymentMethodData = c.req.valid("json");

    const paymentMethod = await paymentMethodsService.createPaymentMethod(userId, paymentMethodData);
    return Response.success(c, { data: paymentMethod });
  }
);

paymentMethodsRouter.get("/", VineValidator("query", getPaymentMethodsValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const query = c.req.valid("query");

    const paymentMethods = await paymentMethodsService.getPaymentMethods(
      userId,
      query.limit,
      query.page
    );

    return Response.success(c, { data: paymentMethods });
  }
);

paymentMethodsRouter.delete("/:id", async (c) => {
  const userId = c.get("userId")!;
  const paymentMethodId = c.req.param("id");

  await paymentMethodsService.deletePaymentMethod(userId, paymentMethodId);
  return Response.success(c, {});
});

paymentMethodsRouter.put("/:id/default", async (c) => {
  const userId = c.get("userId")!;
  const paymentMethodId = c.req.param("id");

  await paymentMethodsService.setDefaultPaymentMethod(userId, paymentMethodId);
  return Response.success(c, {});
});

export default paymentMethodsRouter;