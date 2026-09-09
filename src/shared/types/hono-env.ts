import type { LambdaContext } from "hono/aws-lambda";

export interface AppVariables {
    userId: string;
    apiKeyId: string;
    projectId: string;
    requestId: string;
}

export interface AppEnv {
    Bindings: LambdaContext;
    Variables: AppVariables;
}
