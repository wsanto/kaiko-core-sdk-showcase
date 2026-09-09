export interface ApiRequestParams {
    userId: string;
    apiKeyId: string;
    requestId: string;
    projectId: string;
    apiPath: string;
    requestParams: Record<string, any>;
}