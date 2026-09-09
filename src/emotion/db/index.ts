import { drizzle } from 'drizzle-orm/node-postgres';

import { emotionsMessage } from "./schema/emotion_message";
import { conversationContext } from "./schema/conversation_context";
// Phase 6 schemas
export { emotionTrajectory } from './schema/emotion-trajectory';
export type { EmotionTrajectory, InsertEmotionTrajectory } from './schema/emotion-trajectory';
export { emotionPatterns } from './schema/emotion-patterns';
export type { EmotionPattern, InsertEmotionPattern } from './schema/emotion-patterns';
export { hostilityTracking } from './schema/hostility-tracking';
export type { HostilityTracking, InsertHostilityTracking } from './schema/hostility-tracking';

export const createDB = () => {
    const DATABASE_URL = process.env.DATABASE_URL;
    const db = drizzle(DATABASE_URL!, {
        schema: {
            emotionsMessage,
            conversationContext,
        },
    });

    return db;
}
export type Database = ReturnType<typeof createDB>;

export { emotionsMessage, conversationContext };