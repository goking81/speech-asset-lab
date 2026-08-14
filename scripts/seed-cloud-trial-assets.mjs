import { createHash } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const { Client } = pg;

const LOCAL_USER_ID = 'local-user';
const TRIAL_USER_ID = 'trial-user';
const DEFAULT_LOCAL_DATABASE_URL = 'file:../data/speech-asset-lab.db';

function parseArguments(argumentsList) {
  const allowed = new Set(['--dry-run']);
  for (const argument of argumentsList) {
    if (!allowed.has(argument)) {
      throw new Error(`不支持的参数：${argument}`);
    }
  }
  return { dryRun: argumentsList.includes('--dry-run') };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function insertRow(client, tableName, values) {
  const entries = Object.entries(values);
  const columns = entries.map(([column]) => quoteIdentifier(column)).join(', ');
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ');
  await client.query(
    `INSERT INTO ${quoteIdentifier(tableName)} (${columns}) VALUES (${placeholders})`,
    entries.map(([, value]) => value),
  );
}

function deriveFlowStructure(flow, nodes) {
  let cursor = 0;
  const retainedSpans = nodes.map((node) => {
    const startOffset = flow.indexOf(node.text, cursor);
    if (startOffset < 0) return null;
    const endOffset = startOffset + node.text.length;
    cursor = endOffset;
    return { sequence: node.sequence, startOffset, endOffset };
  });

  if (retainedSpans.every((span) => span !== null)) {
    return {
      nodes: nodes.map((node) => ({
        sequence: node.sequence,
        nodeType: node.nodeType,
        text: node.text,
        sourceNodeIds: [node.id],
        mapType: 'RETAINED',
      })),
      spans: retainedSpans,
    };
  }

  return {
    nodes: [
      {
        sequence: 1,
        nodeType: 'OTHER',
        text: flow.trim(),
        sourceNodeIds: nodes.map((node) => node.id),
        mapType: 'ADAPTED',
      },
    ],
    spans: [{ sequence: 1, startOffset: 0, endOffset: flow.trim().length }],
  };
}

function cloudClient(connectionString) {
  const host = new URL(connectionString).hostname;
  const localHost = host === 'localhost' || host === '127.0.0.1';

  return new Client({
    connectionString,
    ssl: localHost ? false : { rejectUnauthorized: false },
  });
}

async function readTrialAssets(prisma) {
  const [localUser, sourceAssets] = await Promise.all([
    prisma.user.findUnique({ where: { id: LOCAL_USER_ID } }),
    prisma.sourceAsset.findMany({
      where: { versions: { some: { status: 'CONFIRMED' } } },
      orderBy: { createdAt: 'asc' },
      include: {
        versions: {
          where: { status: 'CONFIRMED' },
          orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
          include: {
            nodes: { orderBy: { sequence: 'asc' } },
            expressionUnits: { orderBy: { id: 'asc' } },
          },
        },
      },
    }),
  ]);

  if (!localUser) {
    throw new Error('未找到本机单用户资料，不能生成试用版内置资产。');
  }

  const assets = sourceAssets
    .map((sourceAsset) => ({ ...sourceAsset, version: sourceAsset.versions[0] }))
    .filter((sourceAsset) => sourceAsset.version);

  if (assets.length === 0) {
    throw new Error('本机没有可迁移的已确认来源资产。');
  }

  return { localUser, assets };
}

async function assertEmptyTarget(client) {
  const tableCheck = await client.query(
    `SELECT to_regclass('public."User"') AS user_table,
            to_regclass('public."SourceAsset"') AS source_asset_table`,
  );
  if (!tableCheck.rows[0]?.user_table || !tableCheck.rows[0]?.source_asset_table) {
    throw new Error('云端 PostgreSQL 基线尚未执行，不能导入内置资产。');
  }

  const countResult = await client.query(
    'SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "SourceAsset") AS assets',
  );
  const counts = countResult.rows[0];
  if (Number(counts.users) > 0 || Number(counts.assets) > 0) {
    throw new Error('云端试用库不是空库；为避免覆盖现有数据，已停止导入。');
  }
}

async function seedTrialAssets(client, localUser, assets) {
  const now = new Date();
  const activeAssetLimit = localUser.activeAssetLimit;

  await insertRow(client, 'User', {
    id: TRIAL_USER_ID,
    displayName: 'Speech Asset Lab Trial',
    dailyTargetMinutes: localUser.dailyTargetMinutes,
    dailyNewAssetTarget: localUser.dailyNewAssetTarget,
    dailyNewAssetMax: localUser.dailyNewAssetMax,
    activeAssetLimit,
    createdAt: now,
    updatedAt: now,
  });

  for (const [assetIndex, sourceAsset] of assets.entries()) {
    const sourceVersion = sourceAsset.version;
    const personalAssetId = `trial-personal-${sourceAsset.id}`;
    const personalVersionId = `trial-personal-version-${sourceVersion.id}`;
    const flow = sourceVersion.coreFlow.trim();
    const structure = deriveFlowStructure(flow, sourceVersion.nodes);

    await insertRow(client, 'SourceAsset', {
      id: sourceAsset.id,
      userId: TRIAL_USER_ID,
      createdAt: sourceAsset.createdAt,
      updatedAt: sourceAsset.updatedAt,
    });
    await insertRow(client, 'SourceAssetVersion', {
      id: sourceVersion.id,
      sourceAssetId: sourceAsset.id,
      version: sourceVersion.version,
      title: sourceVersion.title,
      coreIdea: sourceVersion.coreIdea,
      coreFlow: flow,
      extendedFlow: sourceVersion.extendedFlow,
      sourceType: sourceVersion.sourceType,
      isAiReconstructed: sourceVersion.isAiReconstructed,
      status: 'CONFIRMED',
      confirmedAt: sourceVersion.confirmedAt ?? now,
      createdAt: sourceVersion.createdAt,
    });

    for (const sourceNode of sourceVersion.nodes) {
      await insertRow(client, 'SourceAssetNode', {
        id: sourceNode.id,
        sourceAssetVersionId: sourceVersion.id,
        sequence: sourceNode.sequence,
        nodeType: sourceNode.nodeType,
        text: sourceNode.text,
      });
    }
    for (const expressionUnit of sourceVersion.expressionUnits) {
      await insertRow(client, 'SourceExpressionUnit', {
        id: expressionUnit.id,
        sourceAssetVersionId: sourceVersion.id,
        unitType: expressionUnit.unitType,
        text: expressionUnit.text,
        retrievalCue: expressionUnit.retrievalCue,
      });
    }

    await insertRow(client, 'PersonalAsset', {
      id: personalAssetId,
      userId: TRIAL_USER_ID,
      sourceAssetId: sourceAsset.id,
      createdAt: now,
      updatedAt: now,
    });
    await insertRow(client, 'PersonalAssetVersion', {
      id: personalVersionId,
      personalAssetId,
      version: 1,
      triggerName: sourceVersion.title,
      coreIdea: sourceVersion.coreIdea,
      coreFlow: flow,
      extendedFlow: sourceVersion.extendedFlow,
      scenario: '内置试用学习资产',
      status: 'CONFIRMED',
      confirmedAt: now,
      createdAt: now,
    });

    for (const personalNode of structure.nodes) {
      const personalNodeId = `trial-personal-node-${sourceVersion.id}-${personalNode.sequence}`;
      await insertRow(client, 'PersonalAssetNode', {
        id: personalNodeId,
        personalAssetVersionId: personalVersionId,
        sequence: personalNode.sequence,
        nodeType: personalNode.nodeType,
        text: personalNode.text,
      });
      for (const sourceNodeId of personalNode.sourceNodeIds) {
        await insertRow(client, 'PersonalNodeSourceMap', {
          id: `trial-map-${personalNodeId}-${sourceNodeId}`,
          personalAssetNodeId: personalNodeId,
          sourceAssetNodeId: sourceNodeId,
          mapType: personalNode.mapType,
        });
      }
    }
    for (const span of structure.spans) {
      const personalNodeId = `trial-personal-node-${sourceVersion.id}-${span.sequence}`;
      await insertRow(client, 'AssetFlowSpan', {
        id: `trial-span-${personalVersionId}-${span.sequence}`,
        personalAssetVersionId: personalVersionId,
        personalAssetNodeId: personalNodeId,
        sequence: span.sequence,
        startOffset: span.startOffset,
        endOffset: span.endOffset,
        textHash: sha256(flow),
      });
    }
    await insertRow(client, 'UserAssetState', {
      id: `trial-state-${sourceAsset.id}`,
      userId: TRIAL_USER_ID,
      personalAssetId,
      internalStage: 'S0',
      visibleStage: 'ASSET_ACCUMULATION',
      learningState: 'LEARNING',
      understanding: 0,
      recall: 0,
      invocation: 0,
      flexibility: 0,
      stitching: 0,
      transfer: 0,
      nextReviewAt: null,
      isActive: assetIndex < activeAssetLimit,
      updatedAt: now,
    });
  }
}

async function main() {
  const { dryRun } = parseArguments(process.argv.slice(2));
  const localDatabaseUrl = process.env.LOCAL_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
  const localPrisma = new PrismaClient({ datasources: { db: { url: localDatabaseUrl } } });

  try {
    const { localUser, assets } = await readTrialAssets(localPrisma);
    const summary = {
      sourceAssets: assets.length,
      sourceVersions: assets.length,
      initialTrainableAssets: assets.length,
      activeAssets: Math.min(assets.length, localUser.activeAssetLimit),
      excluded: [
        '来源原件与本机文件路径',
        '导入批次、来源文档与候选草稿',
        '训练记录、备份、日志与 AI 原始响应',
      ],
    };

    if (dryRun) {
      process.stdout.write(`${JSON.stringify({ dryRun: true, summary }, null, 2)}\n`);
      return;
    }

    const cloudDatabaseUrl = process.env.CLOUD_DATABASE_URL?.trim();
    if (!cloudDatabaseUrl) {
      throw new Error('缺少 CLOUD_DATABASE_URL；请只在本机受保护的环境变量中提供云端连接串。');
    }

    const target = cloudClient(cloudDatabaseUrl);
    await target.connect();
    try {
      await target.query('BEGIN');
      await assertEmptyTarget(target);
      await seedTrialAssets(target, localUser, assets);
      await target.query('COMMIT');
      process.stdout.write(`${JSON.stringify({ migrated: true, summary }, null, 2)}\n`);
    } catch (error) {
      await target.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await target.end();
    }
  } finally {
    await localPrisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : '内置资产迁移失败。'}\n`);
  process.exitCode = 1;
});
