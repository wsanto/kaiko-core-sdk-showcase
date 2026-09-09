import { Response, VineValidator } from "@shared/utils";
import type { AppEnv } from "@shared/types/hono-env";
import { Hono } from "hono";
import { container } from "tsyringe";
import InvoiceService from "./invoice.service";
import { getInvoicesQueryValidator } from "./invoice.validator";

const invoiceRouter = new Hono<AppEnv>();

invoiceRouter.get(
    "/",
    VineValidator("query", getInvoicesQueryValidator),
    async (c) => {
        const userId = c.get("userId")!;
        const query = c.req.valid("query");

        const invoiceService = container.resolve(InvoiceService);
        const result = await invoiceService.getInvoices({
            userId,
            page: query.page,
            limit: query.limit,
        });

        return Response.success(c, { data: result });
    }
);

export default invoiceRouter;