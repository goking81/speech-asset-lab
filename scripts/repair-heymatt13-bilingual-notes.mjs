import { PrismaClient } from '@prisma/client';

// 独立维护脚本不会经过 Next.js 的环境变量加载；与 prisma.config.ts 使用相同的本地默认值。
process.env.DATABASE_URL ??= 'file:../data/speech-asset-lab.db';

const title = '天助自助者';
const expectedCoreFlow = [
  'you have to put yourself in the position to get lucky',
  'you have to put in all the ground work',
  'you have to take a lot of shots',
  'you have to really stick with something for a long time',
  "to see whether that's gonna be the thing that takes off",
  'because nobody is going to hand you success on a platter.',
].join('\n');
const originalPhraseNotes = [
  '词伙中文参考（原文）',
  'put yourself in the position to get lucky（运气靠拼出来）',
  'put in all the ground work（从基础干起）',
  'take a lot of shots（不断尝试）',
  'stick with something for a long time（坚持不懈）',
  'hand you success on a platter（不劳而获）',
].join('\n');

function assertExpectedFlow(version, label) {
  if (!version || version.coreFlow !== expectedCoreFlow) {
    throw new Error(`${label} 与已核对的“${title}”原始语流不一致，未写入任何修改。`);
  }
}

const prisma = new PrismaClient();

try {
  const foreignKeyIssues = await prisma.$queryRawUnsafe('PRAGMA foreign_key_check');
  if (foreignKeyIssues.length > 0) {
    throw new Error(
      `本地数据库存在外键完整性问题，无法安全写入补充注释：${JSON.stringify(foreignKeyIssues)}`,
    );
  }

  const personalVersion = await prisma.personalAssetVersion.findFirst({
    where: {
      triggerName: title,
      personalAsset: { userId: 'local-user', sourceAsset: { userId: 'local-user' } },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      personalAsset: {
        include: {
          sourceAsset: {
            include: {
              versions: {
                where: { status: 'CONFIRMED' },
                orderBy: { version: 'desc' },
                include: {
                  nodes: { orderBy: { sequence: 'asc' } },
                  expressionUnits: { orderBy: { id: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  });
  const sourceAsset = personalVersion?.personalAsset.sourceAsset;
  const sourceVersion = sourceAsset?.versions[0];

  assertExpectedFlow(personalVersion, '个人资产版本');
  assertExpectedFlow(sourceVersion, '来源资产版本');

  if (sourceVersion.extendedFlow === originalPhraseNotes) {
    console.log('“天助自助者”的原文词伙中文注释已存在，无需重复创建版本。');
  } else {
    if (sourceVersion.extendedFlow) {
      throw new Error('来源资产已有不同的补充内容，为避免覆盖来源版本，未写入任何修改。');
    }
    await prisma.sourceAssetVersion.create({
      data: {
        sourceAssetId: sourceAsset.id,
        version: sourceVersion.version + 1,
        title: sourceVersion.title,
        coreIdea: sourceVersion.coreIdea,
        coreFlow: sourceVersion.coreFlow,
        extendedFlow: originalPhraseNotes,
        sourceType: sourceVersion.sourceType,
        isAiReconstructed: sourceVersion.isAiReconstructed,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        nodes: {
          create: sourceVersion.nodes.map((node) => ({
            sequence: node.sequence,
            nodeType: node.nodeType,
            text: node.text,
          })),
        },
        expressionUnits: {
          create: sourceVersion.expressionUnits.map((unit) => ({
            unitType: unit.unitType,
            text: unit.text,
            retrievalCue: unit.retrievalCue,
          })),
        },
      },
    });
    console.log('已创建来源版本 v2，并补回“天助自助者”的原文词伙中文注释。');
  }
} finally {
  await prisma.$disconnect();
}
