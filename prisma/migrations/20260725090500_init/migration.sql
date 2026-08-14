-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL DEFAULT 'Local User',
    "dailyTargetMinutes" INTEGER NOT NULL DEFAULT 30,
    "dailyNewAssetTarget" INTEGER NOT NULL DEFAULT 3,
    "dailyNewAssetMax" INTEGER NOT NULL DEFAULT 4,
    "activeAssetLimit" INTEGER NOT NULL DEFAULT 8,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiProviderConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "term" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceCollectionId" TEXT,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "originalName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportBatch_sourceCollectionId_fkey" FOREIGN KEY ("sourceCollectionId") REFERENCES "SourceCollection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportBatchFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importBatchId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "exactFileHash" TEXT,
    "normalizedTextHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportBatchFile_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceDocument_sourceCollectionId_fkey" FOREIGN KEY ("sourceCollectionId") REFERENCES "SourceCollection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SourceDocument_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SourceDocument_importBatchFileId_fkey" FOREIGN KEY ("importBatchFileId") REFERENCES "ImportBatchFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceDocumentDuplicate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromDocumentId" TEXT NOT NULL,
    "toDocumentId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "similarity" REAL,
    "resolution" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceDocumentDuplicate_fromDocumentId_fkey" FOREIGN KEY ("fromDocumentId") REFERENCES "SourceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SourceDocumentDuplicate_toDocumentId_fkey" FOREIGN KEY ("toDocumentId") REFERENCES "SourceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceDocumentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "heading" TEXT,
    "blockType" TEXT NOT NULL DEFAULT 'OTHER',
    "eligibleForAssetExtraction" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceSegment_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceSpanAnnotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSegmentId" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "annotationType" TEXT NOT NULL,
    "valueJson" TEXT,
    CONSTRAINT "SourceSpanAnnotation_sourceSegmentId_fkey" FOREIGN KEY ("sourceSegmentId") REFERENCES "SourceSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceDocumentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coreIdea" TEXT NOT NULL,
    "flowText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "modelDraftJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CandidateAsset_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateAssetNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateAssetId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "nodeType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "CandidateAssetNode_candidateAssetId_fkey" FOREIGN KEY ("candidateAssetId") REFERENCES "CandidateAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateAssetId" TEXT NOT NULL,
    "sourceSegmentId" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    CONSTRAINT "CandidateEvidence_candidateAssetId_fkey" FOREIGN KEY ("candidateAssetId") REFERENCES "CandidateAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateEvidence_sourceSegmentId_fkey" FOREIGN KEY ("sourceSegmentId") REFERENCES "SourceSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceAssetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceAssetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "coreIdea" TEXT NOT NULL,
    "coreFlow" TEXT NOT NULL,
    "extendedFlow" TEXT,
    "sourceType" TEXT NOT NULL,
    "isAiReconstructed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceAssetVersion_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "SourceAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceAssetNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceAssetVersionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "nodeType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "SourceAssetNode_sourceAssetVersionId_fkey" FOREIGN KEY ("sourceAssetVersionId") REFERENCES "SourceAssetVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceExpressionUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceAssetVersionId" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "retrievalCue" TEXT,
    CONSTRAINT "SourceExpressionUnit_sourceAssetVersionId_fkey" FOREIGN KEY ("sourceAssetVersionId") REFERENCES "SourceAssetVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonalAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonalAsset_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "SourceAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalAssetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalAssetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "triggerName" TEXT NOT NULL,
    "coreIdea" TEXT NOT NULL,
    "coreFlow" TEXT NOT NULL,
    "extendedFlow" TEXT,
    "scenario" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalAssetVersion_personalAssetId_fkey" FOREIGN KEY ("personalAssetId") REFERENCES "PersonalAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalAssetNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalAssetVersionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "nodeType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "PersonalAssetNode_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalExpressionUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalAssetVersionId" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "retrievalCue" TEXT,
    CONSTRAINT "PersonalExpressionUnit_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalNodeSourceMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalAssetNodeId" TEXT NOT NULL,
    "sourceAssetNodeId" TEXT NOT NULL,
    "mapType" TEXT NOT NULL,
    CONSTRAINT "PersonalNodeSourceMap_personalAssetNodeId_fkey" FOREIGN KEY ("personalAssetNodeId") REFERENCES "PersonalAssetNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonalNodeSourceMap_sourceAssetNodeId_fkey" FOREIGN KEY ("sourceAssetNodeId") REFERENCES "SourceAssetNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetFlowSpan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personalAssetVersionId" TEXT NOT NULL,
    "personalAssetNodeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "textHash" TEXT NOT NULL,
    CONSTRAINT "AssetFlowSpan_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetFlowSpan_personalAssetNodeId_fkey" FOREIGN KEY ("personalAssetNodeId") REFERENCES "PersonalAssetNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserAssetState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "personalAssetId" TEXT NOT NULL,
    "internalStage" TEXT NOT NULL DEFAULT 'S0',
    "visibleStage" TEXT NOT NULL DEFAULT 'ASSET_ACCUMULATION',
    "learningState" TEXT NOT NULL DEFAULT 'LEARNING',
    "understanding" INTEGER NOT NULL DEFAULT 0,
    "recall" INTEGER NOT NULL DEFAULT 0,
    "invocation" INTEGER NOT NULL DEFAULT 0,
    "flexibility" INTEGER NOT NULL DEFAULT 0,
    "stitching" INTEGER NOT NULL DEFAULT 0,
    "transfer" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserAssetState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserAssetState_personalAssetId_fkey" FOREIGN KEY ("personalAssetId") REFERENCES "PersonalAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QuestionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "distance" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "supportProofJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionPlan_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionPlanAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionPlanId" TEXT NOT NULL,
    "personalAssetVersionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "personalAssetVersionIdSnapshot" TEXT,
    CONSTRAINT "QuestionPlanAsset_questionPlanId_fkey" FOREIGN KEY ("questionPlanId") REFERENCES "QuestionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionObligation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionPlanId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "obligationType" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL,
    CONSTRAINT "QuestionObligation_questionPlanId_fkey" FOREIGN KEY ("questionPlanId") REFERENCES "QuestionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionSupportMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionObligationId" TEXT NOT NULL,
    "supportType" TEXT NOT NULL,
    "supportReferenceId" TEXT NOT NULL,
    "explanation" TEXT,
    CONSTRAINT "QuestionSupportMapping_questionObligationId_fkey" FOREIGN KEY ("questionObligationId") REFERENCES "QuestionObligation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dailyPlanId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "targetEntityId" TEXT,
    "reason" TEXT,
    "eligibilityJson" TEXT,
    CONSTRAINT "TrainingTask_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetPracticeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "personalAssetId" TEXT NOT NULL,
    "personalAssetVersionId" TEXT NOT NULL,
    "trainingTaskId" TEXT,
    "currentStep" TEXT NOT NULL DEFAULT 'READING',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssetPracticeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetPracticeSession_personalAssetId_fkey" FOREIGN KEY ("personalAssetId") REFERENCES "PersonalAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssetPracticeSession_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssetPracticeSession_trainingTaskId_fkey" FOREIGN KEY ("trainingTaskId") REFERENCES "TrainingTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetPracticeAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetPracticeSessionId" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "oralAttemptConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "completionRating" TEXT,
    "difficultyRating" TEXT,
    "highestHintLevel" TEXT NOT NULL DEFAULT 'H0_NONE',
    "textAnswer" TEXT,
    "durationMs" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "AssetPracticeAttempt_assetPracticeSessionId_fkey" FOREIGN KEY ("assetPracticeSessionId") REFERENCES "AssetPracticeSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questionPlanId" TEXT NOT NULL,
    "releaseBundleId" TEXT,
    "businessVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrainingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainingSession_questionPlanId_fkey" FOREIGN KEY ("questionPlanId") REFERENCES "QuestionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrainingSession_releaseBundleId_fkey" FOREIGN KEY ("releaseBundleId") REFERENCES "AiReleaseBundle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingSessionId" TEXT NOT NULL,
    "answerType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingAnswer_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnswerUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingAnswerId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "unitType" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "AnswerUnit_trainingAnswerId_fkey" FOREIGN KEY ("trainingAnswerId") REFERENCES "TrainingAnswer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FollowUpItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingSessionId" TEXT NOT NULL,
    "issuedIndex" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "supportProofJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "endReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpItem_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HintEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingSessionId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HintEvent_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetUsageResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingSessionId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "finalLevel" INTEGER,
    "resultJson" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetUsageResult_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnswerEvaluationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingSessionId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalScore" INTEGER,
    "performanceLabel" TEXT,
    "resultJson" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnswerEvaluationResult_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnswerDimensionRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerEvaluationResultId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "evidenceJson" TEXT,
    CONSTRAINT "AnswerDimensionRating_answerEvaluationResultId_fkey" FOREIGN KEY ("answerEvaluationResultId") REFERENCES "AnswerEvaluationResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnswerComparisonResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingSessionId" TEXT NOT NULL,
    "factsJson" TEXT NOT NULL,
    "interpretationJson" TEXT,
    "factsStatus" TEXT NOT NULL,
    "interpretationStatus" TEXT NOT NULL,
    "finalDisplayStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnswerComparisonResult_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiReleaseBundle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "bundleHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "PromptDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "schemaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiReleasePrompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aiReleaseBundleId" TEXT NOT NULL,
    "promptDefinitionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "AiReleasePrompt_aiReleaseBundleId_fkey" FOREIGN KEY ("aiReleaseBundleId") REFERENCES "AiReleaseBundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiReleasePrompt_promptDefinitionId_fkey" FOREIGN KEY ("promptDefinitionId") REFERENCES "PromptDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingSessionId" TEXT,
    "releaseBundleId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityVersion" INTEGER NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "resultReference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiTask_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AiTask_releaseBundleId_fkey" FOREIGN KEY ("releaseBundleId") REFERENCES "AiReleaseBundle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiTaskAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aiTaskId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "attemptType" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "rawResponse" TEXT,
    "parsedJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiTaskAttempt_aiTaskId_fkey" FOREIGN KEY ("aiTaskId") REFERENCES "AiTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiValidationIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aiTaskId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "fieldPath" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiValidationIssue_aiTaskId_fkey" FOREIGN KEY ("aiTaskId") REFERENCES "AiTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trainingSessionId" TEXT NOT NULL,
    "checkpointType" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionCheckpoint_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "contentHash" TEXT,
    "sizeBytes" INTEGER,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" DATETIME,
    CONSTRAINT "BackupRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
CREATE UNIQUE INDEX "SourceDocumentDuplicate_fromDocumentId_toDocumentId_matchType_key" ON "SourceDocumentDuplicate"("fromDocumentId", "toDocumentId", "matchType");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSegment_sourceDocumentId_sequence_key" ON "SourceSegment"("sourceDocumentId", "sequence");

-- CreateIndex
CREATE INDEX "SourceSpanAnnotation_sourceSegmentId_startOffset_idx" ON "SourceSpanAnnotation"("sourceSegmentId", "startOffset");

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
CREATE UNIQUE INDEX "PersonalNodeSourceMap_personalAssetNodeId_sourceAssetNodeId_mapType_key" ON "PersonalNodeSourceMap"("personalAssetNodeId", "sourceAssetNodeId", "mapType");

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
CREATE INDEX "AssetPracticeAttempt_assetPracticeSessionId_stepType_startedAt_idx" ON "AssetPracticeAttempt"("assetPracticeSessionId", "stepType", "startedAt");

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
CREATE INDEX "AnswerEvaluationResult_trainingSessionId_answerId_isCurrent_idx" ON "AnswerEvaluationResult"("trainingSessionId", "answerId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerDimensionRating_answerEvaluationResultId_dimension_key" ON "AnswerDimensionRating"("answerEvaluationResultId", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerComparisonResult_trainingSessionId_key" ON "AnswerComparisonResult"("trainingSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AiReleaseBundle_version_key" ON "AiReleaseBundle"("version");

-- CreateIndex
CREATE UNIQUE INDEX "AiReleaseBundle_bundleHash_key" ON "AiReleaseBundle"("bundleHash");

-- CreateIndex
CREATE UNIQUE INDEX "PromptDefinition_key_version_key" ON "PromptDefinition"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AiReleasePrompt_aiReleaseBundleId_role_key" ON "AiReleasePrompt"("aiReleaseBundleId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AiTask_role_entityId_entityVersion_releaseBundleId_inputFingerprint_key" ON "AiTask"("role", "entityId", "entityVersion", "releaseBundleId", "inputFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AiTaskAttempt_aiTaskId_attemptNo_key" ON "AiTaskAttempt"("aiTaskId", "attemptNo");

-- CreateIndex
CREATE INDEX "SessionCheckpoint_trainingSessionId_createdAt_idx" ON "SessionCheckpoint"("trainingSessionId", "createdAt");

-- 确认后的来源版本和个人版本只能通过创建新版本演进，禁止覆盖历史记录。
CREATE TRIGGER "SourceAssetVersion_immutable"
BEFORE UPDATE ON "SourceAssetVersion"
BEGIN
    SELECT RAISE(ABORT, 'SourceAssetVersion is immutable');
END;

CREATE TRIGGER "PersonalAssetVersion_immutable"
BEFORE UPDATE ON "PersonalAssetVersion"
BEGIN
    SELECT RAISE(ABORT, 'PersonalAssetVersion is immutable');
END;

