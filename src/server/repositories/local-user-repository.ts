import type { PrismaClient } from '@prisma/client';

export type LocalUser = {
  id: string;
  displayName: string;
};

export type LocalUserRepository = {
  ensureDefaultUser(): Promise<LocalUser>;
};

export function createLocalUserRepository(client: PrismaClient): LocalUserRepository {
  return {
    async ensureDefaultUser() {
      const user = await client.user.upsert({
        where: { id: 'local-user' },
        update: {},
        create: { id: 'local-user', displayName: 'Local User' },
        select: { id: true, displayName: true },
      });

      return user;
    },
  };
}
