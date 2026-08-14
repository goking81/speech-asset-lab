import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const user = await prisma.user.upsert({
    where: { id: 'local-user' },
    update: {},
    create: { id: 'local-user', displayName: 'Local User' },
    select: { id: true },
  });

  await Promise.all([
    prisma.userSetting.upsert({
      where: { userId_key: { userId: user.id, key: 'privacy.aiLogRetention' } },
      update: {},
      create: { userId: user.id, key: 'privacy.aiLogRetention', valueJson: '{"mode":"local"}' },
    }),
    prisma.userSetting.upsert({
      where: { userId_key: { userId: user.id, key: 'privacy.aiLogPolicy' } },
      update: {},
      create: {
        userId: user.id,
        key: 'privacy.aiLogPolicy',
        valueJson: '{"storeRawAiResponses":false,"retentionDays":30}',
      },
    }),
    prisma.userSetting.upsert({
      where: { userId_key: { userId: user.id, key: 'storage.root' } },
      update: {},
      create: { userId: user.id, key: 'storage.root', valueJson: '{"mode":"environment"}' },
    }),
  ]);
} finally {
  await prisma.$disconnect();
}
