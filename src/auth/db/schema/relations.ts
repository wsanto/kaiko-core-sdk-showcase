import { relations } from "drizzle-orm";
import { apiKey } from "./api_key";
import { apiKeyType } from "./api_key_type";
import { project } from "./project";
import { user } from "./user";
import { userMetadata } from "./user_metadata";
import { userSocial } from "./user_social";

export const userRelations = relations(user, ({ many, one }) => ({
    socials: many(userSocial),
    metadata: one(userMetadata, {
        fields: [user.id],
        references: [userMetadata.userId],
    }),
    projects: many(project),
}));

export const userSocialRelations = relations(userSocial, ({ one }) => ({
    user: one(user, {
        fields: [userSocial.userId],
        references: [user.id],
    }),
}));

export const userMetadataRelations = relations(userMetadata, ({ one }) => ({
    user: one(user, {
        fields: [userMetadata.userId],
        references: [user.id],
    }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
    user: one(user, {
        fields: [project.userId],
        references: [user.id],
    }),
    apiKeys: many(apiKey),
}));

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
    project: one(project, {
        fields: [apiKey.projectId],
        references: [project.id],
    }),
    keyType: one(apiKeyType, {
        fields: [apiKey.keyTypeId],
        references: [apiKeyType.id],
    }),
}));

export const apiKeyTypeRelations = relations(apiKeyType, ({ many }) => ({
    apiKeys: many(apiKey),
}));
