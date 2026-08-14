import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { PrismaClient } from '@prisma/client';

const execFileAsync = promisify(execFile);
const sourceDirectory = 'C:\\Users\\furong.xu\\Desktop\\heymatt9期';
const collectionTitle = 'HeyMatt 第13—23期（初始来源）';
const userId = 'local-user';
const dryRun = process.argv.includes('--dry-run');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** 从 Word 文档 XML 还原段落，避免依赖 Office 或网络服务。 */
async function readDocxParagraphs(filePath) {
  const { stdout } = await execFileAsync('tar.exe', ['-xOf', filePath, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const paragraphs = stdout.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs.map((paragraph) =>
    decodeXml(
      paragraph
        .replace(/<w:tab\s*\/>/g, ' ')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    ),
  );
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/u.test(value);
}

function englishLetters(value) {
  return (value.match(/[A-Za-z]/g) ?? []).length;
}

function isSeparator(value) {
  return /^[\s_—－=\-–]{4,}$/u.test(value);
}

function isTeachingLabel(value) {
  return /(词伙|逆推|问题|注[：:①②]|作业|资料|熟记|背诵|复盘|课程|练习|衍生|第.+课|第一节|今天|重点|语流对接)/u.test(
    value,
  );
}

function isAssetHeading(value) {
  return (
    /^[\u3400-\u9fff]/u.test(value) &&
    hasCjk(value) &&
    value.length <= 48 &&
    englishLetters(value) < 8 &&
    !isTeachingLabel(value) &&
    !/[。！？；：]/u.test(value)
  );
}

function isEnglishFlowLine(value) {
  if (!value || hasCjk(value) || englishLetters(value) < 8) return false;
  // 填空练习和残缺复写不是可直接训练的完整语流。
  if (value.includes('_')) return false;
  if (/\?\s*$/u.test(value)) return false;
  if (/^(because|like|so|i mean|for example|you know|right)\s*[.….!]*$/iu.test(value)) {
    return false;
  }
  return true;
}

function nodeTypeFor(line, index) {
  if (index === 0) return 'CLAIM';
  if (/^(because|since|as )/iu.test(line)) return 'REASON';
  if (/^(like|for example|suppose|imagine)/iu.test(line)) return 'EXAMPLE';
  if (/^(so|therefore|as a result|at the end of the day)/iu.test(line)) return 'CONCLUSION';
  return 'EXPLANATION';
}

function titleFor(block, fallback) {
  const firstFlowLine = block.findIndex(isEnglishFlowLine);
  const headings = block.slice(0, firstFlowLine).filter(isAssetHeading);
  return headings.at(-1)?.replace(/\s+/g, ' ').trim() ?? fallback;
}

function normalizedEnglish(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * 保留紧随完整语流后的“词伙：英文（中文释义）”原文注释。
 * 注释是理解参考，不属于可复现的英文核心语流，因此单独存入 extendedFlow。
 */
function originalPhraseNotesForFlow(paragraphs, flowLines) {
  const flowStart = paragraphs.findIndex((paragraph, index) =>
    flowLines.every((line, offset) => paragraphs[index + offset] === line),
  );
  if (flowStart < 0) return null;

  const normalizedFlow = normalizedEnglish(flowLines.join(' '));
  const notes = [];
  for (let index = flowStart + flowLines.length; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (index > flowStart + flowLines.length && isAssetHeading(paragraph)) break;
    const match = paragraph.match(/^(.+?)（([^（）]+)）$/u);
    if (!match || englishLetters(match[1]) < 4) continue;
    if (normalizedFlow.includes(normalizedEnglish(match[1]))) {
      notes.push(paragraph);
    }
  }

  return notes.length > 0 ? `词伙中文参考（原文）\n${notes.join('\n')}` : null;
}

function flowsFromParagraphs(paragraphs, fallbackTitle) {
  const blocks = [];
  let block = [];
  let blankCount = 0;
  const flush = () => {
    if (block.length > 0) blocks.push(block);
    block = [];
    blankCount = 0;
  };

  for (const paragraph of paragraphs) {
    if (!paragraph || isSeparator(paragraph)) {
      blankCount += 1;
      if (isSeparator(paragraph) || blankCount >= 4) flush();
      continue;
    }
    if (isAssetHeading(paragraph) && block.some(isEnglishFlowLine)) flush();
    if (isTeachingLabel(paragraph) && block.some(isEnglishFlowLine)) flush();
    blankCount = 0;
    block.push(paragraph);
  }
  flush();

  return blocks.flatMap((block, index) => {
    const lines = block.filter(isEnglishFlowLine);
    const wordCount = lines.join(' ').match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0;
    if (lines.length < 2 || wordCount < 18) return [];
    const title = titleFor(block, `${fallbackTitle} ${index + 1}`);
    return [
      {
        title,
        coreIdea: `围绕“${title}”的英语语流。`,
        flowText: lines.join('\n'),
        extendedFlow: originalPhraseNotesForFlow(paragraphs, lines),
        nodes: lines.map((text, lineIndex) => ({ nodeType: nodeTypeFor(text, lineIndex), text })),
      },
    ];
  });
}

async function listDocxFiles(directory, relativePrefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativePrefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listDocxFiles(absolutePath, relativePath)));
    } else if (
      entry.isFile() &&
      path.extname(entry.name).toLowerCase() === '.docx' &&
      !entry.name.startsWith('~$')
    ) {
      files.push({ absolutePath, relativePath });
    }
  }
  return files;
}

async function inspect() {
  const files = await listDocxFiles(sourceDirectory);
  const inspected = [];
  for (const file of files) {
    const paragraphs = await readDocxParagraphs(file.absolutePath);
    const title = path.basename(file.relativePath, '.docx');
    inspected.push({
      ...file,
      flows: flowsFromParagraphs(paragraphs, title),
      sizeBytes: (await stat(file.absolutePath)).size,
    });
  }
  // 同一语流在后续作业或复盘中重复出现时，只保留第一次出现的来源资产。
  const seenFlowHashes = new Set();
  for (const item of inspected) {
    item.flows = item.flows.filter((flow) => {
      const normalized = flow.flowText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      const flowHash = sha256(normalized);
      if (seenFlowHashes.has(flowHash)) return false;
      seenFlowHashes.add(flowHash);
      return true;
    });
  }
  return inspected;
}

function localFilePath(batchId, relativePath) {
  return path.posix.join('imports', batchId, relativePath.split(path.sep).join('/'));
}

async function main() {
  const inspected = await inspect();
  const usable = inspected.filter((item) => item.flows.length > 0);
  const summary = {
    sourceDirectory,
    documentsScanned: inspected.length,
    documentsIncluded: usable.length,
    documentsExcluded: inspected.length - usable.length,
    learningFlows: usable.reduce((total, item) => total + item.flows.length, 0),
    documents: inspected.map((item) => ({
      relativePath: item.relativePath,
      flowCount: item.flows.length,
      titles: item.flows.map((flow) => flow.title),
    })),
  };

  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (usable.length === 0) throw new Error('没有识别到可导入的英语语流，未写入数据库。');
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.sourceCollection.findFirst({
      where: { userId, title: collectionTitle },
      include: { documents: { select: { id: true }, take: 1 } },
    });
    if (existing?.documents.length) {
      throw new Error('该来源集合已经导入。为避免重复，脚本没有写入任何内容。');
    }

    const [user, activeCount] = await Promise.all([
      prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, displayName: 'Local User' },
      }),
      prisma.userAssetState.count({ where: { userId, isActive: true } }),
    ]);
    const collection =
      existing ??
      (await prisma.sourceCollection.create({
        data: { userId, title: collectionTitle, term: '第13—23期' },
      }));
    const batch = await prisma.importBatch.create({
      data: {
        userId,
        sourceCollectionId: collection.id,
        sourceType: 'LOCAL_FILES',
        originalName: 'heymatt9期（后台初始资产导入）',
        status: 'PARSING',
      },
    });

    let importedAssets = 0;
    let activeAssets = activeCount;
    for (const item of usable) {
      const rawFile = await readFile(item.absolutePath);
      const exactFileHash = sha256(rawFile);
      const storedPath = localFilePath(batch.id, item.relativePath);
      const destination = path.resolve(process.cwd(), 'data', 'files', storedPath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(item.absolutePath, destination);

      await prisma.$transaction(async (transaction) => {
        const importFile = await transaction.importBatchFile.create({
          data: {
            importBatchId: batch.id,
            relativePath: item.relativePath.split(path.sep).join('/'),
            originalFileName: path.basename(item.relativePath),
            extension: '.docx',
            sizeBytes: item.sizeBytes,
            exactFileHash,
            normalizedTextHash: sha256(item.flows.map((flow) => flow.flowText).join('\n\n')),
            status: 'PARSED',
          },
        });
        const document = await transaction.sourceDocument.create({
          data: {
            sourceCollectionId: collection.id,
            importBatchId: batch.id,
            importBatchFileId: importFile.id,
            title: path.basename(item.relativePath, '.docx'),
            documentType: 'DOCX',
            localFilePath: storedPath,
            relativePath: item.relativePath.split(path.sep).join('/'),
            originalFileName: path.basename(item.relativePath),
            exactFileHash,
            parsedTextHash: sha256(item.flows.map((flow) => flow.flowText).join('\n\n')),
            parseStatus: 'PARSED',
            segments: {
              create: item.flows.map((flow, index) => ({
                sequence: index + 1,
                blockType: 'ASSET_FLOW',
                eligibleForAssetExtraction: true,
                text: flow.flowText,
                textHash: sha256(flow.flowText),
              })),
            },
          },
          include: { segments: { orderBy: { sequence: 'asc' } } },
        });

        for (const [index, flow] of item.flows.entries()) {
          const segment = document.segments[index];
          const candidate = await transaction.candidateAsset.create({
            data: {
              sourceDocumentId: document.id,
              title: flow.title,
              coreIdea: flow.coreIdea,
              flowText: flow.flowText,
              modelDraftJson: JSON.stringify({
                origin: 'BACKEND_IMPORT_HUMAN_AUTHORIZED',
                source: 'heymatt9期',
                aiGenerated: false,
              }),
              nodes: {
                create: flow.nodes.map((node, nodeIndex) => ({
                  sequence: nodeIndex + 1,
                  nodeType: node.nodeType,
                  text: node.text,
                })),
              },
              evidence: {
                create: {
                  sourceSegmentId: segment.id,
                  startOffset: 0,
                  endOffset: segment.text.length,
                },
              },
            },
            include: { nodes: { orderBy: { sequence: 'asc' } } },
          });
          const sourceAsset = await transaction.sourceAsset.create({
            data: {
              userId,
              versions: {
                create: {
                  version: 1,
                  title: flow.title,
                  coreIdea: flow.coreIdea,
                  coreFlow: flow.flowText,
                  extendedFlow: flow.extendedFlow,
                  sourceType: 'BACKEND_IMPORT_HUMAN_AUTHORIZED',
                  status: 'CONFIRMED',
                  confirmedAt: new Date(),
                  nodes: {
                    create: candidate.nodes.map((node) => ({
                      sequence: node.sequence,
                      nodeType: node.nodeType,
                      text: node.text,
                    })),
                  },
                },
              },
            },
            include: { versions: { include: { nodes: { orderBy: { sequence: 'asc' } } } } },
          });
          const sourceVersion = sourceAsset.versions[0];
          await transaction.candidateAsset.update({
            where: { id: candidate.id },
            data: { status: 'APPROVED', sourceAssetVersionId: sourceVersion.id },
          });
          const personalAsset = await transaction.personalAsset.create({
            data: { userId, sourceAssetId: sourceAsset.id },
          });
          const personalVersion = await transaction.personalAssetVersion.create({
            data: {
              personalAssetId: personalAsset.id,
              version: 1,
              triggerName: flow.title,
              coreIdea: flow.coreIdea,
              coreFlow: flow.flowText,
              extendedFlow: flow.extendedFlow,
              scenario: 'HeyMatt 初始学习资产',
              status: 'CONFIRMED',
              confirmedAt: new Date(),
              nodes: {
                create: sourceVersion.nodes.map((node) => ({
                  sequence: node.sequence,
                  nodeType: node.nodeType,
                  text: node.text,
                  sourceMaps: { create: { sourceAssetNodeId: node.id, mapType: 'RETAINED' } },
                })),
              },
            },
            include: { nodes: { orderBy: { sequence: 'asc' } } },
          });
          await transaction.assetFlowSpan.createMany({
            data: personalVersion.nodes.map((node) => {
              const sourceNode = sourceVersion.nodes.find(
                (item) => item.sequence === node.sequence,
              );
              const startOffset = flow.flowText.indexOf(sourceNode.text);
              return {
                personalAssetVersionId: personalVersion.id,
                personalAssetNodeId: node.id,
                sequence: node.sequence,
                startOffset,
                endOffset: startOffset + sourceNode.text.length,
                textHash: sha256(flow.flowText),
              };
            }),
          });
          await transaction.userAssetState.create({
            data: {
              userId,
              personalAssetId: personalAsset.id,
              isActive: activeAssets < user.activeAssetLimit,
            },
          });
          if (activeAssets < user.activeAssetLimit) activeAssets += 1;
          importedAssets += 1;
        }
      });
    }
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: 'COMPLETED' } });
    const report = {
      ...summary,
      batchId: batch.id,
      sourceCollectionId: collection.id,
      importedAssets,
      activeAssetsAdded: Math.max(0, activeAssets - activeCount),
      completedAt: new Date().toISOString(),
    };
    const reportDirectory = path.resolve(process.cwd(), 'data', 'import-reports');
    await mkdir(reportDirectory, { recursive: true });
    await writeFile(
      path.join(reportDirectory, `heymatt9-${batch.id}.json`),
      JSON.stringify(report, null, 2),
      'utf8',
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
