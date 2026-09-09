import { Database, userMetadata as userMetadataSchema, user as userSchema, userSocial } from "@auth/db";
import { eq } from "drizzle-orm";
import { autoInjectable, inject } from "tsyringe";
import { Logger } from "winston";

@autoInjectable()
export class UserService {
  constructor(
    @inject("DB") private database: Database,
    @inject("LOGGER") private logger: Logger
  ) { }

  async getById(id: string) {
    const user = await this.database
      .query.user.findFirst({
        where: eq(userSchema.id, id),
        with: {
          metadata: true,
        }
      })
    return user;
  }

  async update(
    id: string,
    {
      user: userParams,
      metadata: userMetadataParams,
    }: {
      user?: Partial<typeof userSchema.$inferInsert>
      metadata?: Partial<typeof userMetadataSchema.$inferInsert>
    }
  ) {
    let updatedUser
    let updatedMetadata

    if (userParams && Object.keys(userParams).length > 0) {
      const result = await this.database
        .update(userSchema)
        .set({
          ...userParams,
        })
        .where(eq(userSchema.id, id))
        .returning()
      updatedUser = result[0]
    } else {
      updatedUser = await this.database.query.user.findFirst({
        where: eq(userSchema.id, id),
      })
    }

    if (userMetadataParams && Object.keys(userMetadataParams).length > 0) {
      const result = await this.database
        .update(userMetadataSchema)
        .set({
          ...userMetadataParams,
        })
        .where(eq(userMetadataSchema.userId, id))
        .returning()
      updatedMetadata = result[0]
    } else {
      updatedMetadata = await this.database.query.userMetadata.findFirst({
        where: eq(userMetadataSchema.userId, id),
      })
    }

    return {
      ...updatedUser,
      metadata: updatedMetadata,
    }
  }


  async findOrCreateUserFromSocial(provider: string, data: { id: string, email: string, username?: string, displayName?: string, profilePictureUrl?: string }): Promise<(typeof userSchema.$inferSelect)> {
    return await this.database.transaction(async (tx) => {

      const social = await tx.query.userSocial.findFirst({
        with: { user: true },
        where: eq(userSocial.providerUserId, data.id),
      });
      if (social?.user) return social.user;

      let user = await tx.query.user.findFirst({
        where: eq(userSchema.email, data.email),
      });

      if (user) {
        await tx.insert(userSocial).values({
          userId: user.id,
          provider,
          providerUserId: data.id,
        });
        return user;
      }

      user = (await tx.insert(userSchema).values({
        email: data.email,
        displayName: data.displayName,
        avatarUrl: data.profilePictureUrl,
        lastSignedInAt: new Date(),
      }).returning())[0];

      await Promise.all([
        tx.insert(userSocial).values({
          userId: user.id,
          provider,
          providerUserId: data.id,
        }),
        tx.insert(userMetadataSchema).values({ userId: user.id }),
      ]);

      return user;
    });
  }
}
