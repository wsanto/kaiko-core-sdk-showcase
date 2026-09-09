import { usageLogPayloadValidator } from "@billing/modules/usage";
import { Infer } from "@vinejs/vine/types";

export type UsageLogPayloadBody = Infer<typeof usageLogPayloadValidator>;