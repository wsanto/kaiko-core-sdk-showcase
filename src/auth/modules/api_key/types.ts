export type CreateApiKeyInput = {
    name: string;
    /** Optional: Defaults to Synapse API Key type if not provided */
    keyTypeId?: string;
    metadata?: Record<string, any>;
};

export type ProjectListApiKeyFilters = {
    typeId?: string;
    isActive?: boolean;
    name?: string
};

export type ListApiKeyFilters = {
    typeId?: string;
    isActive?: boolean;
    projectId?: string
    name?: string
};