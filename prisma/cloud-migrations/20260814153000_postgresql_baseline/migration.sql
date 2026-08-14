-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InternalStage" AS ENUM ('S0', 'S1', 'S2', 'S3', 'S4', 'S5');

-- CreateEnum
CREATE TYPE "VisibleStage" AS ENUM ('ASSET_ACCUMULATION', 'SINGLE_ASSET_INVOCATION', 'STITCHING');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserFactStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PENDING_REVIEW', 'EDITING', 'APPROVED', 'IGNORED', 'CONVERTED', 'FAILED');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('CONTEXT', 'CLAIM', 'REASON', 'EXPLANATION', 'EXAMPLE', 'CONTRAST', 'CONDITION', 'ACTION', 'RESULT', 'CONCLUSION', 'TRANSITION', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpressionUnitType" AS ENUM ('PHRASE_CHUNK', 'SENTENCE_PATTERN', 'CONNECTOR', 'LEXICAL_ANCHOR');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PENDING', 'VALIDATING', 'READY', 'PARSING', 'PARTIAL_SUCCESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportFileStatus" AS ENUM ('PENDING', 'VALIDATING', 'READY', 'PARSING', 'PARSED', 'PARSE_FAILED', 'EXACT_DUPLICATE', 'NEAR_DUPLICATE', 'SKIPPED_UNSUPPORTED', 'WAITING_AI', 'AI_PROCESSING', 'AI_FAILED', 'REVIEW_READY');

-- CreateEnum
CREATE TYPE "DuplicateResolution" AS ENUM ('PENDING', 'SKIP', 'KEEP_SEPARATE', 'MARK_AS_REVISION');

-- CreateEnum
CREATE TYPE "SourceBlockType" AS ENUM ('INSTRUCTION', 'ASSET_FLOW', 'RETRIEVAL_CUE', 'PHRASE_CHUNK', 'SENTENCE_PATTERN', 'QUESTION_SEED', 'EXERCISE', 'TEACHER_NOTE', 'PRONUNCIATION_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetLearningState" AS ENUM ('LEARNING', 'RECALLABLE', 'CALLABLE', 'STITCHABLE', 'TRANSFERABLE', 'NEEDS_REINFORCEMENT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('COURSE', 'AI_GENERATED', 'USER_REAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "QuestionDistance" AS ENUM ('L1', 'L2', 'L3', 'L4');

-- CreateEnum
CREATE TYPE "QuestionPlanStatus" AS ENUM ('DRAFT', 'VALIDATED', 'INVALID', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AssetRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "TrainingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "AssetPracticeStep" AS ENUM ('READING', 'KEYWORD_RECALL', 'LOGIC_SKELETON_RECALL', 'NO_HINT_RECALL', 'ANCHOR_TEXT', 'CLOZE_RECALL', 'CUMULATIVE_RECALL');

-- CreateEnum
CREATE TYPE "PracticeModality" AS ENUM ('READ_ONLY', 'ORAL_SELF_REPORT', 'TEXT');

-- CreateEnum
CREATE TYPE "PracticeAttemptStatus" AS ENUM ('DRAFT', 'SAVING', 'COMPLETED', 'ABANDONED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "CompletionRating" AS ENUM ('COMPLETE', 'BASIC', 'PARTIAL', 'NOT_COMPLETED');

-- CreateEnum
CREATE TYPE "DifficultyRating" AS ENUM ('EASY', 'RIGHT', 'DIFFICULT');

-- CreateEnum
CREATE TYPE "HintLevel" AS ENUM ('H0_NONE', 'H1_ANGLE', 'H2_ASSET_NAME', 'H3_LOGIC_NODES', 'H4_ENGLISH_CHUNKS', 'H5_FULL_FLOW');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PREPARING', 'QUESTION_READY', 'FIRST_ANSWER_SUBMITTED', 'FOLLOW_UP_IN_PROGRESS', 'FOLLOW_UP_COMPLETE', 'SECOND_ANSWER_SUBMITTED', 'EVALUATION_PENDING', 'REVIEW_READY', 'COMPLETED', 'INVALIDATED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "AnswerType" AS ENUM ('FIRST_ANSWER', 'FOLLOW_UP_ANSWER', 'SECOND_ANSWER');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('READY', 'ANSWERED', 'SKIPPED', 'INVALIDATED', 'ENDED');

-- CreateEnum
CREATE TYPE "AiRole" AS ENUM ('R1', 'R2', 'R3', 'R4', 'R4A', 'R5', 'R6', 'R7A', 'R7B', 'R7C');

-- CreateEnum
CREATE TYPE "AiTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'PROVIDER_RETRYING', 'STRUCTURE_REPAIRING', 'BUSINESS_REPAIRING', 'VALIDATED', 'AWAITING_USER_CONFIRMATION', 'NEEDS_REVIEW', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttemptType" AS ENUM ('INITIAL', 'PROVIDER_RETRY', 'PROVIDER_FALLBACK', 'STRUCTURE_REPAIR', 'BUSINESS_REPAIR', 'LOCAL_FALLBACK');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'CANDIDATE', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('CREATING', 'COMPLETED', 'FAILED', 'RESTORING', 'RESTORED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT 'Local User',
    "dailyTargetMinutes" INTEGER NOT NULL DEFAULT 30,
    "dailyNewAssetTarget" INTEGER NOT NULL DEFAULT 3,
    "dailyNewAssetMax" INTEGER NOT NULL DEFAULT 4,
    "activeAssetLimit" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "UserFactStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProviderConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "baseUrl" TEXT,
    "modelName" TEXT NOT NULL,
    "secretRef" TEXT,
    "maskedKeySuffix" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 60000,
    "retryCount" INTEGER NOT NULL DEFAULT 1,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "term" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceCollectionId" TEXT,
    "sourceType" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PENDING',
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatchFile" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "exactFileHash" TEXT,
    "normalizedTextHash" TEXT,
    "status" "ImportFileStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "parseProgressCurrent" INTEGER,
    "parseProgressTotal" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatchFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "sourceCollectionId" TEXT,
    "importBatchId" TEXT,
    "importBatchFileId" TEXT,
    "title" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "localFilePath" TEXT,
    "relativePath" TEXT,
    "originalFileName" TEXT,
    "exactFileHash" TEXT,
    "parsedTextHash" TEXT,
    "parseStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocumentDuplicate" (
    "id" TEXT NOT NULL,
    "fromDocumentId" TEXT NOT NULL,
    "toDocumentId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION,
    "resolution" "DuplicateResolution" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceDocumentDuplicate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSegment" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "heading" TEXT,
    "blockType" "SourceBlockType" NOT NULL DEFAULT 'OTHER',
    "eligibleForAssetExtraction" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSpanAnnotation" (
    "id" TEXT NOT NULL,
    "sourceSegmentId" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "annotationType" TEXT NOT NULL,
    "valueJson" TEXT,

    CONSTRAINT "SourceSpanAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateAsset" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceAssetVersionId" TEXT,
    "title" TEXT NOT NULL,
    "coreIdea" TEXT NOT NULL,
    "flowText" TEXT NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "modelDraftJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateAssetNode" (
    "id" TEXT NOT NULL,
    "candidateAssetId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "CandidateAssetNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEvidence" (
    "id" TEXT NOT NULL,
    "candidateAssetId" TEXT NOT NULL,
    "sourceSegmentId" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,

    CONSTRAINT "CandidateEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceAssetVersion" (
    "id" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "coreIdea" TEXT NOT NULL,
    "coreFlow" TEXT NOT NULL,
    "extendedFlow" TEXT,
    "sourceType" TEXT NOT NULL,
    "isAiReconstructed" BOOLEAN NOT NULL DEFAULT false,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceAssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceAssetNode" (
    "id" TEXT NOT NULL,
    "sourceAssetVersionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "SourceAssetNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceExpressionUnit" (
    "id" TEXT NOT NULL,
    "sourceAssetVersionId" TEXT NOT NULL,
    "unitType" "ExpressionUnitType" NOT NULL,
    "text" TEXT NOT NULL,
    "retrievalCue" TEXT,

    CONSTRAINT "SourceExpressionUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalAssetVersion" (
    "id" TEXT NOT NULL,
    "personalAssetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "triggerName" TEXT NOT NULL,
    "coreIdea" TEXT NOT NULL,
    "coreFlow" TEXT NOT NULL,
    "extendedFlow" TEXT,
    "scenario" TEXT,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalAssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalAssetNode" (
    "id" TEXT NOT NULL,
    "personalAssetVersionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "PersonalAssetNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalExpressionUnit" (
    "id" TEXT NOT NULL,
    "personalAssetVersionId" TEXT NOT NULL,
    "unitType" "ExpressionUnitType" NOT NULL,
    "text" TEXT NOT NULL,
    "retrievalCue" TEXT,

    CONSTRAINT "PersonalExpressionUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalNodeSourceMap" (
    "id" TEXT NOT NULL,
    "personalAssetNodeId" TEXT NOT NULL,
    "sourceAssetNodeId" TEXT NOT NULL,
    "mapType" TEXT NOT NULL,

    CONSTRAINT "PersonalNodeSourceMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetFlowSpan" (
    "id" TEXT NOT NULL,
    "personalAssetVersionId" TEXT NOT NULL,
    "personalAssetNodeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "textHash" TEXT NOT NULL,

    CONSTRAINT "AssetFlowSpan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAssetState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personalAssetId" TEXT NOT NULL,
    "internalStage" "InternalStage" NOT NULL DEFAULT 'S0',
    "visibleStage" "VisibleStage" NOT NULL DEFAULT 'ASSET_ACCUMULATION',
    "learningState" "AssetLearningState" NOT NULL DEFAULT 'LEARNING',
    "understanding" INTEGER NOT NULL DEFAULT 0,
    "recall" INTEGER NOT NULL DEFAULT 0,
    "invocation" INTEGER NOT NULL DEFAULT 0,
    "flexibility" INTEGER NOT NULL DEFAULT 0,
    "stitching" INTEGER NOT NULL DEFAULT 0,
    "transfer" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAssetState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" "QuestionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPlan" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "distance" "QuestionDistance" NOT NULL,
    "status" "QuestionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "supportProofJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPlanAsset" (
    "id" TEXT NOT NULL,
    "questionPlanId" TEXT NOT NULL,
    "personalAssetVersionId" TEXT NOT NULL,
    "role" "AssetRole" NOT NULL,
    "personalAssetVersionIdSnapshot" TEXT,

    CONSTRAINT "QuestionPlanAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionObligation" (
    "id" TEXT NOT NULL,
    "questionPlanId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "obligationType" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL,

    CONSTRAINT "QuestionObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionSupportMapping" (
    "id" TEXT NOT NULL,
    "questionObligationId" TEXT NOT NULL,
    "supportType" TEXT NOT NULL,
    "supportReferenceId" TEXT NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "QuestionSupportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingTask" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "TrainingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "targetEntityId" TEXT,
    "reason" TEXT,
    "eligibilityJson" TEXT,

    CONSTRAINT "TrainingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPracticeSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personalAssetId" TEXT NOT NULL,
    "personalAssetVersionId" TEXT NOT NULL,
    "trainingTaskId" TEXT,
    "currentStep" "AssetPracticeStep" NOT NULL DEFAULT 'READING',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetPracticeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPracticeAttempt" (
    "id" TEXT NOT NULL,
    "assetPracticeSessionId" TEXT NOT NULL,
    "stepType" "AssetPracticeStep" NOT NULL,
    "modality" "PracticeModality" NOT NULL,
    "status" "PracticeAttemptStatus" NOT NULL DEFAULT 'DRAFT',
    "oralAttemptConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "completionRating" "CompletionRating",
    "difficultyRating" "DifficultyRating",
    "highestHintLevel" "HintLevel" NOT NULL DEFAULT 'H0_NONE',
    "textAnswer" TEXT,
    "durationMs" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssetPracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPracticeCheckpoint" (
    "id" TEXT NOT NULL,
    "assetPracticeSessionId" TEXT NOT NULL,
    "currentStep" "AssetPracticeStep" NOT NULL,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetPracticeCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionPlanId" TEXT NOT NULL,
    "releaseBundleId" TEXT,
    "businessVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "SessionStatus" NOT NULL DEFAULT 'PREPARING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAnswer" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "answerType" "AnswerType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerUnit" (
    "id" TEXT NOT NULL,
    "trainingAnswerId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "unitType" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "AnswerUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpItem" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "issuedIndex" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "supportProofJson" TEXT NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'READY',
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HintEvent" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "level" "HintLevel" NOT NULL,
    "context" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetUsageResult" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "finalLevel" INTEGER,
    "resultJson" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetUsageResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetUsageAssessment" (
    "id" TEXT NOT NULL,
    "assetUsageResultId" TEXT NOT NULL,
    "personalAssetVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isCompleteInvocation" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetUsageAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeUsageEvidence" (
    "id" TEXT NOT NULL,
    "assetUsageAssessmentId" TEXT NOT NULL,
    "personalAssetNodeId" TEXT NOT NULL,
    "answerUnitId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodeUsageEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligationCoverage" (
    "id" TEXT NOT NULL,
    "assetUsageResultId" TEXT NOT NULL,
    "questionObligationId" TEXT NOT NULL,
    "answerUnitId" TEXT,
    "status" TEXT NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObligationCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerEvaluationResult" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalScore" INTEGER,
    "performanceLabel" TEXT,
    "resultJson" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerEvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerDimensionRating" (
    "id" TEXT NOT NULL,
    "answerEvaluationResultId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NOT_EVALUABLE',
    "source" TEXT NOT NULL,
    "evidenceJson" TEXT,

    CONSTRAINT "AnswerDimensionRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationIssue" (
    "id" TEXT NOT NULL,
    "answerEvaluationResultId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "issueCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "answerEvaluationResultId" TEXT NOT NULL,
    "evaluationIssueId" TEXT,
    "dimension" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correction" (
    "id" TEXT NOT NULL,
    "answerEvaluationResultId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "dimension" TEXT NOT NULL,
    "answerUnitId" TEXT NOT NULL,
    "replacementText" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerComparisonResult" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "factsJson" TEXT NOT NULL,
    "interpretationJson" TEXT,
    "factsStatus" TEXT NOT NULL,
    "interpretationStatus" TEXT NOT NULL,
    "finalDisplayStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerComparisonResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DimensionComparison" (
    "id" TEXT NOT NULL,
    "answerComparisonResultId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "firstRating" INTEGER,
    "secondRating" INTEGER,
    "firstStatus" TEXT NOT NULL,
    "secondStatus" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,

    CONSTRAINT "DimensionComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligationChange" (
    "id" TEXT NOT NULL,
    "answerComparisonResultId" TEXT NOT NULL,
    "questionObligationId" TEXT NOT NULL,
    "firstStatus" TEXT NOT NULL,
    "secondStatus" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,

    CONSTRAINT "ObligationChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeChange" (
    "id" TEXT NOT NULL,
    "answerComparisonResultId" TEXT NOT NULL,
    "personalAssetNodeId" TEXT NOT NULL,
    "firstUsed" BOOLEAN NOT NULL,
    "secondUsed" BOOLEAN NOT NULL,
    "changeType" TEXT NOT NULL,

    CONSTRAINT "NodeChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReleaseBundle" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "bundleHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "AiReleaseBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "schemaJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReleasePrompt" (
    "id" TEXT NOT NULL,
    "aiReleaseBundleId" TEXT NOT NULL,
    "promptDefinitionId" TEXT NOT NULL,
    "role" "AiRole" NOT NULL,

    CONSTRAINT "AiReleasePrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTask" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT,
    "releaseBundleId" TEXT NOT NULL,
    "role" "AiRole" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityVersion" INTEGER NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "status" "AiTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "resultReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTaskAttempt" (
    "id" TEXT NOT NULL,
    "aiTaskId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "attemptType" "AttemptType" NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "rawResponse" TEXT,
    "parsedJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiValidationIssue" (
    "id" TEXT NOT NULL,
    "aiTaskId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "fieldPath" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGoldenSetCase" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "role" "AiRole" NOT NULL,
    "inputJson" TEXT NOT NULL,
    "expectationJson" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGoldenSetCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGoldenSetRun" (
    "id" TEXT NOT NULL,
    "aiReleaseBundleId" TEXT NOT NULL,
    "providerKey" TEXT,
    "modelName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "gateStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "failureSummary" TEXT,
    "runtimeJson" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiGoldenSetRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGoldenSetResult" (
    "id" TEXT NOT NULL,
    "aiGoldenSetRunId" TEXT NOT NULL,
    "aiGoldenSetCaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outputKind" TEXT,
    "outputDigest" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGoldenSetResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProviderCompatibility" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fallbackStatus" TEXT NOT NULL,
    "failureCode" TEXT,
    "runtimeJson" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProviderCompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReleaseAuditEvent" (
    "id" TEXT NOT NULL,
    "aiReleaseBundleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "detailJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReleaseAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionCheckpoint" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "checkpointType" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MANUAL',
    "formatVersion" INTEGER NOT NULL DEFAULT 1,
    "scopeJson" TEXT NOT NULL DEFAULT '{}',
    "status" "BackupStatus" NOT NULL DEFAULT 'CREATING',
    "contentHash" TEXT,
    "sizeBytes" INTEGER,
    "errorMessage" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restorePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFact_userId_status_idx" ON "UserFact"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_userId_key_key" ON "UserSetting"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderConfig_userId_providerKey_modelName_key" ON "AiProviderConfig"("userId", "providerKey", "modelName");

-- CreateIndex
CREATE INDEX "ImportBatch_userId_status_createdAt_idx" ON "ImportBatch"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatchFile_exactFileHash_idx" ON "ImportBatchFile"("exactFileHash");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatchFile_importBatchId_relativePath_key" ON "ImportBatchFile"("importBatchId", "relativePath");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_importBatchFileId_key" ON "SourceDocument"("importBatchFileId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocumentDuplicate_fromDocumentId_toDocumentId_matchTy_key" ON "SourceDocumentDuplicate"("fromDocumentId", "toDocumentId", "matchType");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSegment_sourceDocumentId_sequence_key" ON "SourceSegment"("sourceDocumentId", "sequence");

-- CreateIndex
CREATE INDEX "SourceSpanAnnotation_sourceSegmentId_startOffset_idx" ON "SourceSpanAnnotation"("sourceSegmentId", "startOffset");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateAsset_sourceAssetVersionId_key" ON "CandidateAsset"("sourceAssetVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateAssetNode_candidateAssetId_sequence_key" ON "CandidateAssetNode"("candidateAssetId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "SourceAssetVersion_sourceAssetId_version_key" ON "SourceAssetVersion"("sourceAssetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SourceAssetNode_sourceAssetVersionId_sequence_key" ON "SourceAssetNode"("sourceAssetVersionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAsset_userId_sourceAssetId_key" ON "PersonalAsset"("userId", "sourceAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAssetVersion_personalAssetId_version_key" ON "PersonalAssetVersion"("personalAssetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAssetNode_personalAssetVersionId_sequence_key" ON "PersonalAssetNode"("personalAssetVersionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalNodeSourceMap_personalAssetNodeId_sourceAssetNodeId_key" ON "PersonalNodeSourceMap"("personalAssetNodeId", "sourceAssetNodeId", "mapType");

-- CreateIndex
CREATE INDEX "AssetFlowSpan_personalAssetVersionId_startOffset_idx" ON "AssetFlowSpan"("personalAssetVersionId", "startOffset");

-- CreateIndex
CREATE UNIQUE INDEX "AssetFlowSpan_personalAssetVersionId_sequence_key" ON "AssetFlowSpan"("personalAssetVersionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "UserAssetState_personalAssetId_key" ON "UserAssetState"("personalAssetId");

-- CreateIndex
CREATE INDEX "UserAssetState_userId_learningState_nextReviewAt_idx" ON "UserAssetState"("userId", "learningState", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionPlan_questionId_version_key" ON "QuestionPlan"("questionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionPlanAsset_questionPlanId_role_key" ON "QuestionPlanAsset"("questionPlanId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionObligation_questionPlanId_sequence_key" ON "QuestionObligation"("questionPlanId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_userId_planDate_key" ON "DailyPlan"("userId", "planDate");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTask_dailyPlanId_sequence_key" ON "TrainingTask"("dailyPlanId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AssetPracticeAttempt_idempotencyKey_key" ON "AssetPracticeAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AssetPracticeAttempt_assetPracticeSessionId_stepType_starte_idx" ON "AssetPracticeAttempt"("assetPracticeSessionId", "stepType", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetPracticeCheckpoint_assetPracticeSessionId_key" ON "AssetPracticeCheckpoint"("assetPracticeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAnswer_idempotencyKey_key" ON "TrainingAnswer"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAnswer_trainingSessionId_answerType_sequence_key" ON "TrainingAnswer"("trainingSessionId", "answerType", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerUnit_trainingAnswerId_sequence_key" ON "AnswerUnit"("trainingAnswerId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpItem_trainingSessionId_issuedIndex_key" ON "FollowUpItem"("trainingSessionId", "issuedIndex");

-- CreateIndex
CREATE INDEX "AssetUsageResult_trainingSessionId_answerId_isCurrent_idx" ON "AssetUsageResult"("trainingSessionId", "answerId", "isCurrent");

-- CreateIndex
CREATE INDEX "AssetUsageAssessment_personalAssetVersionId_createdAt_idx" ON "AssetUsageAssessment"("personalAssetVersionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetUsageAssessment_assetUsageResultId_personalAssetVersio_key" ON "AssetUsageAssessment"("assetUsageResultId", "personalAssetVersionId");

-- CreateIndex
CREATE INDEX "NodeUsageEvidence_personalAssetNodeId_answerUnitId_idx" ON "NodeUsageEvidence"("personalAssetNodeId", "answerUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeUsageEvidence_assetUsageAssessmentId_personalAssetNodeI_key" ON "NodeUsageEvidence"("assetUsageAssessmentId", "personalAssetNodeId", "answerUnitId");

-- CreateIndex
CREATE INDEX "ObligationCoverage_questionObligationId_status_idx" ON "ObligationCoverage"("questionObligationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ObligationCoverage_assetUsageResultId_questionObligationId_key" ON "ObligationCoverage"("assetUsageResultId", "questionObligationId");

-- CreateIndex
CREATE INDEX "AnswerEvaluationResult_trainingSessionId_answerId_isCurrent_idx" ON "AnswerEvaluationResult"("trainingSessionId", "answerId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerDimensionRating_answerEvaluationResultId_dimension_key" ON "AnswerDimensionRating"("answerEvaluationResultId", "dimension");

-- CreateIndex
CREATE INDEX "EvaluationIssue_answerEvaluationResultId_dimension_idx" ON "EvaluationIssue"("answerEvaluationResultId", "dimension");

-- CreateIndex
CREATE INDEX "Recommendation_answerEvaluationResultId_dimension_idx" ON "Recommendation"("answerEvaluationResultId", "dimension");

-- CreateIndex
CREATE INDEX "Correction_answerEvaluationResultId_dimension_idx" ON "Correction"("answerEvaluationResultId", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerComparisonResult_trainingSessionId_key" ON "AnswerComparisonResult"("trainingSessionId");

-- CreateIndex
CREATE INDEX "DimensionComparison_dimension_changeType_idx" ON "DimensionComparison"("dimension", "changeType");

-- CreateIndex
CREATE UNIQUE INDEX "DimensionComparison_answerComparisonResultId_dimension_key" ON "DimensionComparison"("answerComparisonResultId", "dimension");

-- CreateIndex
CREATE INDEX "ObligationChange_questionObligationId_changeType_idx" ON "ObligationChange"("questionObligationId", "changeType");

-- CreateIndex
CREATE UNIQUE INDEX "ObligationChange_answerComparisonResultId_questionObligatio_key" ON "ObligationChange"("answerComparisonResultId", "questionObligationId");

-- CreateIndex
CREATE INDEX "NodeChange_personalAssetNodeId_changeType_idx" ON "NodeChange"("personalAssetNodeId", "changeType");

-- CreateIndex
CREATE UNIQUE INDEX "NodeChange_answerComparisonResultId_personalAssetNodeId_key" ON "NodeChange"("answerComparisonResultId", "personalAssetNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "AiReleaseBundle_version_key" ON "AiReleaseBundle"("version");

-- CreateIndex
CREATE UNIQUE INDEX "AiReleaseBundle_bundleHash_key" ON "AiReleaseBundle"("bundleHash");

-- CreateIndex
CREATE UNIQUE INDEX "PromptDefinition_key_version_key" ON "PromptDefinition"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AiReleasePrompt_aiReleaseBundleId_role_key" ON "AiReleasePrompt"("aiReleaseBundleId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AiTask_role_entityId_entityVersion_releaseBundleId_inputFin_key" ON "AiTask"("role", "entityId", "entityVersion", "releaseBundleId", "inputFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AiTaskAttempt_aiTaskId_attemptNo_key" ON "AiTaskAttempt"("aiTaskId", "attemptNo");

-- CreateIndex
CREATE INDEX "AiGoldenSetCase_role_isEnabled_idx" ON "AiGoldenSetCase"("role", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "AiGoldenSetCase_key_version_key" ON "AiGoldenSetCase"("key", "version");

-- CreateIndex
CREATE INDEX "AiGoldenSetRun_aiReleaseBundleId_completedAt_idx" ON "AiGoldenSetRun"("aiReleaseBundleId", "completedAt");

-- CreateIndex
CREATE INDEX "AiGoldenSetResult_aiGoldenSetCaseId_status_idx" ON "AiGoldenSetResult"("aiGoldenSetCaseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AiGoldenSetResult_aiGoldenSetRunId_aiGoldenSetCaseId_key" ON "AiGoldenSetResult"("aiGoldenSetRunId", "aiGoldenSetCaseId");

-- CreateIndex
CREATE INDEX "AiProviderCompatibility_userId_testedAt_idx" ON "AiProviderCompatibility"("userId", "testedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderCompatibility_userId_providerKey_modelName_key" ON "AiProviderCompatibility"("userId", "providerKey", "modelName");

-- CreateIndex
CREATE INDEX "AiReleaseAuditEvent_aiReleaseBundleId_createdAt_idx" ON "AiReleaseAuditEvent"("aiReleaseBundleId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionCheckpoint_trainingSessionId_createdAt_idx" ON "SessionCheckpoint"("trainingSessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserFact" ADD CONSTRAINT "UserFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProviderConfig" ADD CONSTRAINT "AiProviderConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceCollection" ADD CONSTRAINT "SourceCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_sourceCollectionId_fkey" FOREIGN KEY ("sourceCollectionId") REFERENCES "SourceCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatchFile" ADD CONSTRAINT "ImportBatchFile_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_sourceCollectionId_fkey" FOREIGN KEY ("sourceCollectionId") REFERENCES "SourceCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_importBatchFileId_fkey" FOREIGN KEY ("importBatchFileId") REFERENCES "ImportBatchFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocumentDuplicate" ADD CONSTRAINT "SourceDocumentDuplicate_fromDocumentId_fkey" FOREIGN KEY ("fromDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocumentDuplicate" ADD CONSTRAINT "SourceDocumentDuplicate_toDocumentId_fkey" FOREIGN KEY ("toDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSegment" ADD CONSTRAINT "SourceSegment_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSpanAnnotation" ADD CONSTRAINT "SourceSpanAnnotation_sourceSegmentId_fkey" FOREIGN KEY ("sourceSegmentId") REFERENCES "SourceSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAsset" ADD CONSTRAINT "CandidateAsset_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAsset" ADD CONSTRAINT "CandidateAsset_sourceAssetVersionId_fkey" FOREIGN KEY ("sourceAssetVersionId") REFERENCES "SourceAssetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAssetNode" ADD CONSTRAINT "CandidateAssetNode_candidateAssetId_fkey" FOREIGN KEY ("candidateAssetId") REFERENCES "CandidateAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_candidateAssetId_fkey" FOREIGN KEY ("candidateAssetId") REFERENCES "CandidateAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvidence" ADD CONSTRAINT "CandidateEvidence_sourceSegmentId_fkey" FOREIGN KEY ("sourceSegmentId") REFERENCES "SourceSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAsset" ADD CONSTRAINT "SourceAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAssetVersion" ADD CONSTRAINT "SourceAssetVersion_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "SourceAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAssetNode" ADD CONSTRAINT "SourceAssetNode_sourceAssetVersionId_fkey" FOREIGN KEY ("sourceAssetVersionId") REFERENCES "SourceAssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceExpressionUnit" ADD CONSTRAINT "SourceExpressionUnit_sourceAssetVersionId_fkey" FOREIGN KEY ("sourceAssetVersionId") REFERENCES "SourceAssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAsset" ADD CONSTRAINT "PersonalAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAsset" ADD CONSTRAINT "PersonalAsset_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "SourceAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAssetVersion" ADD CONSTRAINT "PersonalAssetVersion_personalAssetId_fkey" FOREIGN KEY ("personalAssetId") REFERENCES "PersonalAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAssetNode" ADD CONSTRAINT "PersonalAssetNode_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalExpressionUnit" ADD CONSTRAINT "PersonalExpressionUnit_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalNodeSourceMap" ADD CONSTRAINT "PersonalNodeSourceMap_personalAssetNodeId_fkey" FOREIGN KEY ("personalAssetNodeId") REFERENCES "PersonalAssetNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalNodeSourceMap" ADD CONSTRAINT "PersonalNodeSourceMap_sourceAssetNodeId_fkey" FOREIGN KEY ("sourceAssetNodeId") REFERENCES "SourceAssetNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFlowSpan" ADD CONSTRAINT "AssetFlowSpan_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFlowSpan" ADD CONSTRAINT "AssetFlowSpan_personalAssetNodeId_fkey" FOREIGN KEY ("personalAssetNodeId") REFERENCES "PersonalAssetNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAssetState" ADD CONSTRAINT "UserAssetState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAssetState" ADD CONSTRAINT "UserAssetState_personalAssetId_fkey" FOREIGN KEY ("personalAssetId") REFERENCES "PersonalAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlan" ADD CONSTRAINT "QuestionPlan_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlanAsset" ADD CONSTRAINT "QuestionPlanAsset_questionPlanId_fkey" FOREIGN KEY ("questionPlanId") REFERENCES "QuestionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionObligation" ADD CONSTRAINT "QuestionObligation_questionPlanId_fkey" FOREIGN KEY ("questionPlanId") REFERENCES "QuestionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSupportMapping" ADD CONSTRAINT "QuestionSupportMapping_questionObligationId_fkey" FOREIGN KEY ("questionObligationId") REFERENCES "QuestionObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingTask" ADD CONSTRAINT "TrainingTask_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPracticeSession" ADD CONSTRAINT "AssetPracticeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPracticeSession" ADD CONSTRAINT "AssetPracticeSession_personalAssetId_fkey" FOREIGN KEY ("personalAssetId") REFERENCES "PersonalAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPracticeSession" ADD CONSTRAINT "AssetPracticeSession_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPracticeSession" ADD CONSTRAINT "AssetPracticeSession_trainingTaskId_fkey" FOREIGN KEY ("trainingTaskId") REFERENCES "TrainingTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPracticeAttempt" ADD CONSTRAINT "AssetPracticeAttempt_assetPracticeSessionId_fkey" FOREIGN KEY ("assetPracticeSessionId") REFERENCES "AssetPracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPracticeCheckpoint" ADD CONSTRAINT "AssetPracticeCheckpoint_assetPracticeSessionId_fkey" FOREIGN KEY ("assetPracticeSessionId") REFERENCES "AssetPracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_questionPlanId_fkey" FOREIGN KEY ("questionPlanId") REFERENCES "QuestionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_releaseBundleId_fkey" FOREIGN KEY ("releaseBundleId") REFERENCES "AiReleaseBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAnswer" ADD CONSTRAINT "TrainingAnswer_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerUnit" ADD CONSTRAINT "AnswerUnit_trainingAnswerId_fkey" FOREIGN KEY ("trainingAnswerId") REFERENCES "TrainingAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpItem" ADD CONSTRAINT "FollowUpItem_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintEvent" ADD CONSTRAINT "HintEvent_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsageResult" ADD CONSTRAINT "AssetUsageResult_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsageAssessment" ADD CONSTRAINT "AssetUsageAssessment_assetUsageResultId_fkey" FOREIGN KEY ("assetUsageResultId") REFERENCES "AssetUsageResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsageAssessment" ADD CONSTRAINT "AssetUsageAssessment_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeUsageEvidence" ADD CONSTRAINT "NodeUsageEvidence_assetUsageAssessmentId_fkey" FOREIGN KEY ("assetUsageAssessmentId") REFERENCES "AssetUsageAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeUsageEvidence" ADD CONSTRAINT "NodeUsageEvidence_personalAssetNodeId_fkey" FOREIGN KEY ("personalAssetNodeId") REFERENCES "PersonalAssetNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeUsageEvidence" ADD CONSTRAINT "NodeUsageEvidence_answerUnitId_fkey" FOREIGN KEY ("answerUnitId") REFERENCES "AnswerUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationCoverage" ADD CONSTRAINT "ObligationCoverage_assetUsageResultId_fkey" FOREIGN KEY ("assetUsageResultId") REFERENCES "AssetUsageResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationCoverage" ADD CONSTRAINT "ObligationCoverage_questionObligationId_fkey" FOREIGN KEY ("questionObligationId") REFERENCES "QuestionObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationCoverage" ADD CONSTRAINT "ObligationCoverage_answerUnitId_fkey" FOREIGN KEY ("answerUnitId") REFERENCES "AnswerUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEvaluationResult" ADD CONSTRAINT "AnswerEvaluationResult_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerDimensionRating" ADD CONSTRAINT "AnswerDimensionRating_answerEvaluationResultId_fkey" FOREIGN KEY ("answerEvaluationResultId") REFERENCES "AnswerEvaluationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationIssue" ADD CONSTRAINT "EvaluationIssue_answerEvaluationResultId_fkey" FOREIGN KEY ("answerEvaluationResultId") REFERENCES "AnswerEvaluationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_answerEvaluationResultId_fkey" FOREIGN KEY ("answerEvaluationResultId") REFERENCES "AnswerEvaluationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_evaluationIssueId_fkey" FOREIGN KEY ("evaluationIssueId") REFERENCES "EvaluationIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_answerEvaluationResultId_fkey" FOREIGN KEY ("answerEvaluationResultId") REFERENCES "AnswerEvaluationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_answerUnitId_fkey" FOREIGN KEY ("answerUnitId") REFERENCES "AnswerUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerComparisonResult" ADD CONSTRAINT "AnswerComparisonResult_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DimensionComparison" ADD CONSTRAINT "DimensionComparison_answerComparisonResultId_fkey" FOREIGN KEY ("answerComparisonResultId") REFERENCES "AnswerComparisonResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationChange" ADD CONSTRAINT "ObligationChange_answerComparisonResultId_fkey" FOREIGN KEY ("answerComparisonResultId") REFERENCES "AnswerComparisonResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationChange" ADD CONSTRAINT "ObligationChange_questionObligationId_fkey" FOREIGN KEY ("questionObligationId") REFERENCES "QuestionObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeChange" ADD CONSTRAINT "NodeChange_answerComparisonResultId_fkey" FOREIGN KEY ("answerComparisonResultId") REFERENCES "AnswerComparisonResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeChange" ADD CONSTRAINT "NodeChange_personalAssetNodeId_fkey" FOREIGN KEY ("personalAssetNodeId") REFERENCES "PersonalAssetNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReleasePrompt" ADD CONSTRAINT "AiReleasePrompt_aiReleaseBundleId_fkey" FOREIGN KEY ("aiReleaseBundleId") REFERENCES "AiReleaseBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReleasePrompt" ADD CONSTRAINT "AiReleasePrompt_promptDefinitionId_fkey" FOREIGN KEY ("promptDefinitionId") REFERENCES "PromptDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_releaseBundleId_fkey" FOREIGN KEY ("releaseBundleId") REFERENCES "AiReleaseBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTaskAttempt" ADD CONSTRAINT "AiTaskAttempt_aiTaskId_fkey" FOREIGN KEY ("aiTaskId") REFERENCES "AiTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiValidationIssue" ADD CONSTRAINT "AiValidationIssue_aiTaskId_fkey" FOREIGN KEY ("aiTaskId") REFERENCES "AiTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGoldenSetRun" ADD CONSTRAINT "AiGoldenSetRun_aiReleaseBundleId_fkey" FOREIGN KEY ("aiReleaseBundleId") REFERENCES "AiReleaseBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGoldenSetResult" ADD CONSTRAINT "AiGoldenSetResult_aiGoldenSetRunId_fkey" FOREIGN KEY ("aiGoldenSetRunId") REFERENCES "AiGoldenSetRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGoldenSetResult" ADD CONSTRAINT "AiGoldenSetResult_aiGoldenSetCaseId_fkey" FOREIGN KEY ("aiGoldenSetCaseId") REFERENCES "AiGoldenSetCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReleaseAuditEvent" ADD CONSTRAINT "AiReleaseAuditEvent_aiReleaseBundleId_fkey" FOREIGN KEY ("aiReleaseBundleId") REFERENCES "AiReleaseBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCheckpoint" ADD CONSTRAINT "SessionCheckpoint_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRecord" ADD CONSTRAINT "BackupRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
