import { drizzle } from "drizzle-orm/node-postgres";
import { apiKeyType, user, userSocial } from "./schema";
import { apiKey } from "./schema/api_key";
import { project } from "./schema/project";
import { apiKeyRelations, apiKeyTypeRelations, projectRelations, userMetadataRelations, userRelations, userSocialRelations } from "./schema/relations";
import { userMetadata } from "./schema/user_metadata";

export { apiKey } from "./schema/api_key";
export { apiKeyType } from "./schema/api_key_type";
export { project } from "./schema/project";
export { user } from "./schema/user";
export { userMetadata } from "./schema/user_metadata";
export { userSocial } from "./schema/user_social";

export const createDB = () => {
    const DATABASE_URL = process.env.DATABASE_URL;
    const db = drizzle(DATABASE_URL!, {
        schema: {
            apiKey,
            userMetadata,
            userSocial,
            user,
            userMetadataRelations,
            userRelations,
            userSocialRelations,
            apiKeyRelations,
            project,
            projectRelations,
            apiKeyType,
            apiKeyTypeRelations
        }
    });

    return db;
}

export type Database = ReturnType<typeof createDB>;
