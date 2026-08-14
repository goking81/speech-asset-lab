import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { MockAiProvider, UnconfiguredAiProvider } from '@/ai/provider';
import { createDatabaseClient } from '@/server/db/client';
import { AiTaskOrchestrator } from '@/server/ai/task-orchestrator';
import { PersonalAssetService } from '@/server/assets/personal-asset-service';
import { CandidateReviewService } from '@/server/content/candidate-review-service';
import { ImportIntakeService } from '@/server/imports/import-intake-service';
import { TextParserService } from '@/server/imports/text-parser-service';
import {
  OralAttemptService,
  OralAttemptValidationError,
} from '@/server/practice/oral-attempt-service';

import {
  SessionCheckpointService,
  SessionCheckpointValidationError,
} from './session-checkpoint-service';

import { AnswerSubmissionService, TextAnswerValidationError } from './answer-submission-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'iteration-03-gates.db');
const testDatabaseUrl = 'file:../data/iteration-03-gates.db';
const testFilesDirectory = path.join(projectRoot, 'data', 'iteration-03-import-files');
const prisma = createDatabaseClient(testDatabaseUrl);
const answers = new AnswerSubmissionService(prisma);
const oralAttempts = new OralAttemptService(prisma);
const checkpoints = new SessionCheckpointService(prisma);

beforeAll(async () => {
  await mkdir(path.dirname(testDatabasePath), { recursive: true });
  await Promise.all([
    rm(testDatabasePath, { force: true }),
    rm(`${testDatabasePath}-journal`, { force: true }),
    rm(`${testDatabasePath}-shm`, { force: true }),
    rm(`${testDatabasePath}-wal`, { force: true }),
    rm(testFilesDirectory, { recursive: true, force: true }),
  ]);
  await writeFile(testDatabasePath, '');

  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
  execFileSync(process.execPath, ['prisma/seed.mjs'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await Promise.all([
    rm(testDatabasePath, { force: true }),
    rm(`${testDatabasePath}-journal`, { force: true }),
    rm(`${testDatabasePath}-shm`, { force: true }),
    rm(`${testDatabasePath}-wal`, { force: true }),
    rm(testFilesDirectory, { recursive: true, force: true }),
  ]);
});

async function createFixture(label: string) {
  const user = await prisma.user.create({ data: { displayName: label } });
  const sourceAsset = await prisma.sourceAsset.create({ data: { userId: user.id } });
  await prisma.sourceAssetVersion.create({
    data: {
      sourceAssetId: sourceAsset.id,
      version: 1,
      title: `${label} source`,
      coreIdea: 'A core idea',
      coreFlow: 'A connected flow.',
      sourceType: 'MANUAL',
    },
  });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId: user.id, sourceAssetId: sourceAsset.id },
  });
  const personalAssetVersion = await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: `${label} asset`,
      coreIdea: 'A core idea',
      coreFlow: 'A connected flow.',
    },
  });
  const assetPracticeSession = await prisma.assetPracticeSession.create({
    data: {
      userId: user.id,
      personalAssetId: personalAsset.id,
      personalAssetVersionId: personalAssetVersion.id,
    },
  });
  const question = await prisma.question.create({ data: { text: `${label}?`, source: 'MANUAL' } });
  const questionPlan = await prisma.questionPlan.create({
    data: { questionId: question.id, version: 1, questionText: question.text, distance: 'L1' },
  });
  const releaseBundle = await prisma.aiReleaseBundle.create({
    data: {
      version: `${label}-bundle`,
      bundleHash: `${label}-bundle-hash`,
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
  });
  const trainingSession = await prisma.trainingSession.create({
    data: { userId: user.id, questionPlanId: questionPlan.id, releaseBundleId: releaseBundle.id },
  });

  return { assetPracticeSession, trainingSession };
}

describe('P05 server-side oral gate', () => {
  test('rejects a missing self-rating and saves a complete oral self-report once', async () => {
    const fixture = await createFixture('oral-gate');

    await expect(
      oralAttempts.save({
        assetPracticeSessionId: fixture.assetPracticeSession.id,
        stepType: 'KEYWORD_RECALL',
        oralAttemptConfirmed: true,
        completionRating: null,
        difficultyRating: 'RIGHT',
        idempotencyKey: 'oral-invalid',
      }),
    ).rejects.toBeInstanceOf(OralAttemptValidationError);

    const input = {
      assetPracticeSessionId: fixture.assetPracticeSession.id,
      stepType: 'KEYWORD_RECALL' as const,
      oralAttemptConfirmed: true,
      completionRating: 'COMPLETE' as const,
      difficultyRating: 'RIGHT' as const,
      idempotencyKey: 'oral-valid',
    };
    const first = await oralAttempts.save(input);
    const second = await oralAttempts.save(input);

    expect(second.id).toBe(first.id);
    await expect(
      prisma.assetPracticeAttempt.count({
        where: { assetPracticeSessionId: fixture.assetPracticeSession.id },
      }),
    ).resolves.toBe(1);
  });
});

describe('P08 transactional submission', () => {
  test('rejects whitespace on the server before writing an answer', async () => {
    const fixture = await createFixture('blank-answer');

    await expect(
      answers.submit({
        trainingSessionId: fixture.trainingSession.id,
        expectedSessionVersion: 1,
        answerType: 'FIRST_ANSWER',
        sequence: 1,
        text: ' \n\t ',
        idempotencyKey: 'blank-answer-key',
      }),
    ).rejects.toBeInstanceOf(TextAnswerValidationError);
    await expect(
      prisma.trainingAnswer.count({ where: { trainingSessionId: fixture.trainingSession.id } }),
    ).resolves.toBe(0);
  });

  test('persists one-word, Chinese-character, and punctuation answers without a minimum length gate', async () => {
    const fixture = await createFixture('short-answer');
    const submissions = [
      { answerType: 'FIRST_ANSWER' as const, text: 'Yes', idempotencyKey: 'short-word' },
      { answerType: 'FOLLOW_UP_ANSWER' as const, text: '字', idempotencyKey: 'short-chinese' },
      { answerType: 'SECOND_ANSWER' as const, text: '。', idempotencyKey: 'short-punctuation' },
    ];

    for (const submission of submissions) {
      await expect(
        answers.submit({
          trainingSessionId: fixture.trainingSession.id,
          expectedSessionVersion: 1,
          sequence: 1,
          ...submission,
        }),
      ).resolves.toMatchObject({ answer: { text: submission.text }, task: { status: 'QUEUED' } });
    }
  });

  test('uses one answer and one AI task when the same submit action is triggered twice', async () => {
    const fixture = await createFixture('idempotent-answer');
    const input = {
      trainingSessionId: fixture.trainingSession.id,
      expectedSessionVersion: 1,
      answerType: 'FIRST_ANSWER' as const,
      sequence: 1,
      text: 'A single saved answer.',
      idempotencyKey: 'same-click-key',
    };

    const [first, second] = await Promise.all([answers.submit(input), answers.submit(input)]);

    expect(second.answer.id).toBe(first.answer.id);
    expect(second.task.id).toBe(first.task.id);
    await expect(
      prisma.trainingAnswer.count({ where: { trainingSessionId: fixture.trainingSession.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.aiTask.count({ where: { trainingSessionId: fixture.trainingSession.id } }),
    ).resolves.toBe(1);
  });
});

describe('F0 session checkpoint baseline', () => {
  test('persists the latest JSON checkpoint for a valid training session', async () => {
    const fixture = await createFixture('checkpoint');

    await checkpoints.create({
      trainingSessionId: fixture.trainingSession.id,
      checkpointType: 'FIRST_ANSWER_DRAFT',
      payload: { draft: 'kept locally' },
    });
    const latest = await checkpoints.latest(fixture.trainingSession.id);

    expect(latest).toMatchObject({
      checkpointType: 'FIRST_ANSWER_DRAFT',
      payloadJson: '{"draft":"kept locally"}',
    });
  });

  test('rejects missing sessions and empty checkpoint types', async () => {
    await expect(
      checkpoints.create({ trainingSessionId: 'missing', checkpointType: 'FIRST_ANSWER_DRAFT' }),
    ).rejects.toBeInstanceOf(SessionCheckpointValidationError);
    await expect(
      checkpoints.create({ trainingSessionId: 'missing', checkpointType: ' ' }),
    ).rejects.toBeInstanceOf(SessionCheckpointValidationError);
  });
});

describe('F1 import intake baseline', () => {
  test('keeps accepted and rejected files in the same batch with controlled local storage', async () => {
    const intake = new ImportIntakeService(prisma, testFilesDirectory);
    const result = await intake.createBatch({
      userId: 'local-user',
      collectionTitle: 'Local course',
      sourceType: 'MULTI_FILE',
      originalName: 'course-folder',
      files: [
        {
          relativePath: 'lesson.txt',
          originalFileName: 'lesson.txt',
          extension: '.txt',
          content: new TextEncoder().encode('local source'),
        },
        {
          relativePath: '../unsafe.exe',
          originalFileName: 'unsafe.exe',
          extension: '.exe',
          content: new Uint8Array([1]),
        },
      ],
    });

    expect(result.batch.status).toBe('PARTIAL_SUCCESS');
    expect(result.batch.files).toMatchObject([
      {
        relativePath: '../unsafe.exe',
        status: 'SKIPPED_UNSUPPORTED',
        skipReason: 'INVALID_RELATIVE_PATH',
      },
      { relativePath: 'lesson.txt', status: 'READY' },
    ]);
    await expect(
      readFile(path.join(testFilesDirectory, 'imports', result.batch.id, 'lesson.txt'), 'utf8'),
    ).resolves.toBe('local source');
  });

  test('removes copied files when the batch transaction cannot be committed', async () => {
    const failedFilesDirectory = path.join(testFilesDirectory, 'failed-transaction');
    const intake = new ImportIntakeService(prisma, failedFilesDirectory);

    await expect(
      intake.createBatch({
        userId: 'missing-user',
        collectionTitle: 'Invalid collection',
        sourceType: 'MULTI_FILE',
        files: [
          {
            relativePath: 'lesson.txt',
            originalFileName: 'lesson.txt',
            extension: '.txt',
            content: new TextEncoder().encode('must be removed'),
          },
        ],
      }),
    ).rejects.toThrow();

    await expect(readdir(failedFilesDirectory, { recursive: true })).resolves.not.toContain(
      'lesson.txt',
    );
  });
});

describe('F1 text parsing baseline', () => {
  test('creates stable source segments and marks an exact duplicate without extracting it again', async () => {
    const intake = new ImportIntakeService(prisma, testFilesDirectory);
    const parser = new TextParserService(prisma, testFilesDirectory);
    const input = {
      userId: 'local-user',
      collectionTitle: 'Parser course',
      sourceType: 'PASTED_TEXT',
      files: [
        {
          relativePath: 'lesson.txt',
          originalFileName: 'lesson.txt',
          extension: '.txt',
          content: new TextEncoder().encode('First paragraph.\n\nSecond paragraph.'),
        },
      ],
    };
    const firstBatch = await intake.createBatch(input);
    const firstDocuments = await parser.parseReadyTextFiles(firstBatch.batch.id);
    const secondBatch = await intake.createBatch({ ...input, collectionTitle: 'Duplicate course' });
    const secondDocuments = await parser.parseReadyTextFiles(secondBatch.batch.id);

    expect(firstDocuments).toHaveLength(1);
    await expect(
      prisma.sourceSegment.findMany({
        where: { sourceDocumentId: firstDocuments[0].id },
        orderBy: { sequence: 'asc' },
        include: { annotations: true },
      }),
    ).resolves.toMatchObject([
      { text: 'First paragraph.', annotations: [{ annotationType: 'PARAGRAPH', startOffset: 0 }] },
      { text: 'Second paragraph.', annotations: [{ annotationType: 'PARAGRAPH', startOffset: 0 }] },
    ]);
    expect(secondDocuments).toHaveLength(1);
    await expect(
      prisma.importBatchFile.findUniqueOrThrow({ where: { id: secondBatch.batch.files[0].id } }),
    ).resolves.toMatchObject({ status: 'EXACT_DUPLICATE' });
    await expect(
      prisma.importBatch.findUniqueOrThrow({ where: { id: firstBatch.batch.id } }),
    ).resolves.toMatchObject({ status: 'COMPLETED' });
  });

  test('extracts local PDF text while keeping the PDF as the source file', async () => {
    const intake = new ImportIntakeService(prisma, testFilesDirectory);
    const parser = new TextParserService(prisma, testFilesDirectory);
    const fixturePdfPath = path.join(testFilesDirectory, 'pdf-text-fixture.pdf');
    await mkdir(testFilesDirectory, { recursive: true });
    const bundledPython = path.join(
      os.homedir(),
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'python',
      'python.exe',
    );
    execFileSync(
      bundledPython,
      [
        '-c',
        [
          'from reportlab.pdfgen.canvas import Canvas',
          'import sys',
          'canvas = Canvas(sys.argv[1])',
          'canvas.drawString(72, 720, "PDF parser keeps this local source text.")',
          'canvas.save()',
        ].join('\n'),
        fixturePdfPath,
      ],
      { windowsHide: true },
    );
    const batch = await intake.createBatch({
      userId: 'local-user',
      collectionTitle: 'PDF course',
      sourceType: 'LOCAL_FILES',
      files: [
        {
          relativePath: 'lesson.pdf',
          originalFileName: 'lesson.pdf',
          extension: '.pdf',
          content: await readFile(fixturePdfPath),
        },
      ],
    });

    await expect(parser.parseReadyTextFiles(batch.batch.id)).resolves.toHaveLength(1);
    await expect(
      prisma.importBatchFile.findUniqueOrThrow({ where: { id: batch.batch.files[0].id } }),
    ).resolves.toMatchObject({ status: 'PARSED', skipReason: null });
    await expect(
      prisma.sourceDocument.findUniqueOrThrow({
        where: { importBatchFileId: batch.batch.files[0].id },
      }),
    ).resolves.toMatchObject({ documentType: 'PDF', parseStatus: 'PARSED' });
    await expect(
      prisma.sourceSegment.findFirstOrThrow({
        where: { sourceDocument: { importBatchFileId: batch.batch.files[0].id } },
      }),
    ).resolves.toMatchObject({ text: 'PDF parser keeps this local source text.' });
  });

  test('falls back to local OCR when a PDF page is an image without a text layer', async () => {
    const intake = new ImportIntakeService(prisma, testFilesDirectory);
    const parser = new TextParserService(prisma, testFilesDirectory);
    const fixtureImagePath = path.join(testFilesDirectory, 'ocr-fixture.png');
    const fixturePdfPath = path.join(testFilesDirectory, 'ocr-fixture.pdf');
    await mkdir(testFilesDirectory, { recursive: true });
    const bundledPython = path.join(
      os.homedir(),
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'python',
      'python.exe',
    );
    execFileSync(
      bundledPython,
      [
        '-c',
        [
          'from PIL import Image, ImageDraw',
          'from reportlab.pdfgen.canvas import Canvas',
          'import sys',
          'image = Image.new("RGB", (1200, 400), "white")',
          'ImageDraw.Draw(image).text((60, 160), "LOCAL OCR SCANNED SOURCE", fill="black")',
          'image.save(sys.argv[1])',
          'canvas = Canvas(sys.argv[2])',
          'canvas.drawImage(sys.argv[1], 72, 500, width=460, height=153)',
          'canvas.save()',
        ].join('\n'),
        fixtureImagePath,
        fixturePdfPath,
      ],
      { windowsHide: true },
    );
    const batch = await intake.createBatch({
      userId: 'local-user',
      collectionTitle: 'OCR PDF course',
      sourceType: 'LOCAL_FILES',
      files: [
        {
          relativePath: 'scanned.pdf',
          originalFileName: 'scanned.pdf',
          extension: '.pdf',
          content: await readFile(fixturePdfPath),
        },
      ],
    });

    await expect(parser.parseReadyTextFiles(batch.batch.id)).resolves.toHaveLength(1);
    await expect(
      prisma.importBatchFile.findUniqueOrThrow({ where: { id: batch.batch.files[0].id } }),
    ).resolves.toMatchObject({ status: 'PARSED', skipReason: null });
    await expect(
      prisma.sourceSegment.findFirstOrThrow({
        where: { sourceDocument: { importBatchFileId: batch.batch.files[0].id } },
      }),
    ).resolves.toMatchObject({ sourceDocumentId: expect.any(String) });
  });

  test('continues parsing other files when an accepted local file is unavailable', async () => {
    const intake = new ImportIntakeService(prisma, testFilesDirectory);
    const parser = new TextParserService(prisma, testFilesDirectory);
    const batch = await intake.createBatch({
      userId: 'local-user',
      collectionTitle: 'Partial parser course',
      sourceType: 'LOCAL_FILES',
      files: [
        {
          relativePath: 'missing.txt',
          originalFileName: 'missing.txt',
          extension: '.txt',
          content: new TextEncoder().encode('This file is removed before parsing.'),
        },
        {
          relativePath: 'available.txt',
          originalFileName: 'available.txt',
          extension: '.txt',
          content: new TextEncoder().encode('This file can still be parsed.'),
        },
      ],
    });
    await unlink(path.join(testFilesDirectory, 'imports', batch.batch.id, 'missing.txt'));
    const missingFile = batch.batch.files.find((file) => file.relativePath === 'missing.txt');
    const availableFile = batch.batch.files.find((file) => file.relativePath === 'available.txt');
    expect(missingFile).toBeDefined();
    expect(availableFile).toBeDefined();

    await expect(parser.parseReadyTextFiles(batch.batch.id)).resolves.toHaveLength(1);
    await expect(
      prisma.importBatchFile.findUniqueOrThrow({ where: { id: missingFile!.id } }),
    ).resolves.toMatchObject({ status: 'PARSE_FAILED', skipReason: 'LOCAL_FILE_READ_FAILED' });
    await expect(
      prisma.importBatchFile.findUniqueOrThrow({ where: { id: availableFile!.id } }),
    ).resolves.toMatchObject({ status: 'PARSED' });
    await expect(
      prisma.importBatch.findUniqueOrThrow({ where: { id: batch.batch.id } }),
    ).resolves.toMatchObject({ status: 'PARTIAL_SUCCESS' });
  });
});

describe('F1 source candidate review baseline', () => {
  test('confirms a manually reviewed candidate as an immutable, traceable source asset version', async () => {
    const intake = new ImportIntakeService(prisma, testFilesDirectory);
    const parser = new TextParserService(prisma, testFilesDirectory);
    const review = new CandidateReviewService(prisma);
    const batch = await intake.createBatch({
      userId: 'local-user',
      collectionTitle: 'Manual review course',
      sourceType: 'PASTED_TEXT',
      files: [
        {
          relativePath: 'manual-review.txt',
          originalFileName: 'manual-review.txt',
          extension: '.txt',
          content: new TextEncoder().encode('A source flow with clear evidence.'),
        },
      ],
    });
    const [document] = await parser.parseReadyTextFiles(batch.batch.id);
    const [segment] = await prisma.sourceSegment.findMany({
      where: { sourceDocumentId: document.id },
    });

    await expect(
      review.createManualCandidate({
        sourceDocumentId: document.id,
        title: 'Evidence-led source asset',
        coreIdea: 'Keep the original source traceable.',
        flowText: 'A source flow with clear evidence.',
        nodes: [{ nodeType: 'CLAIM', text: 'Keep the original source traceable.' }],
        evidence: [
          { sourceSegmentId: segment.id, startOffset: 0, endOffset: segment.text.length + 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'EVIDENCE_OUT_OF_RANGE' });

    const candidate = await review.createManualCandidate({
      sourceDocumentId: document.id,
      title: 'Evidence-led source asset',
      coreIdea: 'Keep the original source traceable.',
      flowText: 'A source flow with clear evidence.',
      nodes: [{ nodeType: 'CLAIM', text: 'Keep the original source traceable.' }],
      expressionUnits: [{ unitType: 'PHRASE_CHUNK', text: 'clear evidence' }],
      evidence: [{ sourceSegmentId: segment.id, startOffset: 0, endOffset: segment.text.length }],
    });

    await expect(
      review.editManualCandidate(candidate.id, {
        title: 'Edited evidence-led source asset',
        coreIdea: 'Keep the source traceable after review.',
        flowText: 'A source flow with clear evidence.',
        nodes: [{ nodeType: 'CLAIM', text: 'Keep the source traceable after review.' }],
        expressionUnits: [{ unitType: 'PHRASE_CHUNK', text: 'clear evidence' }],
      }),
    ).resolves.toMatchObject({ status: 'EDITING' });
    await expect(review.transition(candidate.id, 'PENDING_REVIEW')).resolves.toMatchObject({
      status: 'PENDING_REVIEW',
    });
    await expect(
      prisma.candidateEvidence.findMany({ where: { candidateAssetId: candidate.id } }),
    ).resolves.toMatchObject([
      { sourceSegmentId: segment.id, startOffset: 0, endOffset: segment.text.length },
    ]);
    const approved = await review.confirmCandidate(candidate.id, 'local-user');

    expect(approved).toMatchObject({
      status: 'APPROVED',
      sourceAssetVersionId: expect.any(String),
    });
    await expect(
      prisma.sourceAssetVersion.findUniqueOrThrow({
        where: { id: approved.sourceAssetVersionId! },
        include: { nodes: true, expressionUnits: true, candidate: { include: { evidence: true } } },
      }),
    ).resolves.toMatchObject({
      title: 'Edited evidence-led source asset',
      status: 'CONFIRMED',
      nodes: [{ nodeType: 'CLAIM', text: 'Keep the source traceable after review.' }],
      expressionUnits: [{ unitType: 'PHRASE_CHUNK', text: 'clear evidence' }],
      candidate: { id: candidate.id, evidence: [{ sourceSegmentId: segment.id }] },
    });
    await expect(
      prisma.sourceAssetVersion.update({
        where: { id: approved.sourceAssetVersionId! },
        data: { title: 'Attempted overwrite' },
      }),
    ).rejects.toThrow();
    await expect(review.confirmCandidate(candidate.id, 'local-user')).rejects.toMatchObject({
      code: 'CANDIDATE_ALREADY_CONFIRMED',
    });
  });
});

describe('F1 personal asset baseline', () => {
  test('creates independent personal versions with retained node maps and stable flow spans', async () => {
    const sourceAsset = await prisma.sourceAsset.create({ data: { userId: 'local-user' } });
    const sourceVersion = await prisma.sourceAssetVersion.create({
      data: {
        sourceAssetId: sourceAsset.id,
        version: 1,
        title: 'Personal source',
        coreIdea: 'Source idea',
        coreFlow: 'First source node. Second source node.',
        sourceType: 'MANUAL_REVIEW',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        nodes: {
          create: [
            { sequence: 1, nodeType: 'CLAIM', text: 'First source node.' },
            { sequence: 2, nodeType: 'RESULT', text: 'Second source node.' },
          ],
        },
      },
    });
    const service = new PersonalAssetService(prisma);

    await expect(
      service.createConfirmedVersion({
        userId: 'local-user',
        sourceAssetVersionId: sourceVersion.id,
        triggerName: 'My trigger',
        coreIdea: 'My adapted idea',
        coreFlow: 'First source node. Second source node.',
      }),
    ).resolves.toMatchObject({ version: 1, status: 'CONFIRMED' });
    const version = await prisma.personalAssetVersion.findFirstOrThrow({
      where: { personalAsset: { sourceAssetId: sourceAsset.id } },
      include: {
        nodes: { include: { sourceMaps: true } },
        flowSpans: { orderBy: { sequence: 'asc' } },
      },
    });
    expect(version.nodes).toHaveLength(2);
    expect(version.nodes.every((node) => node.sourceMaps[0]?.mapType === 'RETAINED')).toBe(true);
    expect(version.flowSpans).toMatchObject([
      { sequence: 1, startOffset: 0, endOffset: 18 },
      { sequence: 2, startOffset: 19, endOffset: 38 },
    ]);
    await expect(
      prisma.personalAssetVersion.update({
        where: { id: version.id },
        data: { triggerName: 'Overwrite attempt' },
      }),
    ).rejects.toThrow();
    await expect(
      service.createConfirmedVersion({
        userId: 'local-user',
        sourceAssetVersionId: sourceVersion.id,
        triggerName: 'Edited flow',
        coreIdea: 'Edited',
        coreFlow: 'I keep a water bottle nearby so I can stay focused throughout the day.',
      }),
    ).resolves.toMatchObject({ version: 2, status: 'CONFIRMED' });
    const editedVersion = await prisma.personalAssetVersion.findFirstOrThrow({
      where: { personalAsset: { sourceAssetId: sourceAsset.id }, version: 2 },
      include: { nodes: { include: { sourceMaps: true } }, flowSpans: true },
    });
    expect(editedVersion.nodes).toHaveLength(1);
    expect(editedVersion.nodes[0].sourceMaps).toHaveLength(2);
    expect(editedVersion.nodes[0].sourceMaps.every((map) => map.mapType === 'ADAPTED')).toBe(true);
    expect(editedVersion.flowSpans).toMatchObject([
      { sequence: 1, startOffset: 0, endOffset: editedVersion.coreFlow.length },
    ]);
  });
});

describe('AI task processing', () => {
  async function createTask(label: string) {
    const fixture = await createFixture(label);
    return answers.submit({
      trainingSessionId: fixture.trainingSession.id,
      expectedSessionVersion: 1,
      answerType: 'FIRST_ANSWER',
      sequence: 1,
      text: 'Saved first.',
      idempotencyKey: `${label}-answer`,
    });
  }

  test.each(['UNCONFIGURED', 'TIMEOUT', 'FAILED'] as const)(
    'records %s without removing the saved answer',
    async (code) => {
      const submission = await createTask(`provider-${code.toLowerCase()}`);
      const orchestrator = new AiTaskOrchestrator(
        prisma,
        new MockAiProvider({ kind: 'ERROR', code }),
      );

      await expect(orchestrator.process(submission.task.id)).resolves.toMatchObject({
        status: 'FAILED_RETRYABLE',
        resultReference: code,
      });
      await expect(
        prisma.trainingAnswer.findUnique({ where: { id: submission.answer.id } }),
      ).resolves.toMatchObject({
        text: 'Saved first.',
      });
    },
  );

  test('keeps an insufficient-text answer and marks the draft result for review', async () => {
    const submission = await createTask('provider-insufficient');
    const orchestrator = new AiTaskOrchestrator(
      prisma,
      new MockAiProvider({ kind: 'INSUFFICIENT_TEXT' }),
    );

    await expect(orchestrator.process(submission.task.id)).resolves.toMatchObject({
      status: 'NEEDS_REVIEW',
      resultReference: 'INSUFFICIENT_TEXT',
    });
    await expect(
      prisma.trainingAnswer.findUnique({ where: { id: submission.answer.id } }),
    ).resolves.toBeTruthy();
  });

  test('marks obsolete work as SUPERSEDED without calling a provider', async () => {
    const submission = await createTask('provider-superseded');
    const orchestrator = new AiTaskOrchestrator(prisma, new MockAiProvider());

    await expect(orchestrator.supersede(submission.task.id)).resolves.toMatchObject({
      status: 'SUPERSEDED',
    });
    await expect(orchestrator.process(submission.task.id)).resolves.toMatchObject({
      status: 'SUPERSEDED',
    });
    await expect(
      prisma.aiTaskAttempt.count({ where: { aiTaskId: submission.task.id } }),
    ).resolves.toBe(0);
  });

  test('keeps persisted work safe when no provider is configured and terminates after the retry limit', async () => {
    const submission = await createTask(`provider-unconfigured-${Date.now()}`);
    const orchestrator = new AiTaskOrchestrator(prisma, new UnconfiguredAiProvider(), 1);

    await expect(orchestrator.recoverPending()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: submission.task.id })]),
    );
    await expect(
      prisma.aiTask.findUniqueOrThrow({ where: { id: submission.task.id } }),
    ).resolves.toMatchObject({ status: 'FAILED_RETRYABLE', resultReference: 'UNCONFIGURED' });
    await expect(orchestrator.recoverPending()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: submission.task.id })]),
    );
    await expect(
      prisma.aiTask.findUniqueOrThrow({ where: { id: submission.task.id } }),
    ).resolves.toMatchObject({ status: 'FAILED_TERMINAL', resultReference: 'UNCONFIGURED' });
    await expect(
      prisma.trainingAnswer.findUniqueOrThrow({ where: { id: submission.answer.id } }),
    ).resolves.toMatchObject({ text: 'Saved first.' });
  });
});
