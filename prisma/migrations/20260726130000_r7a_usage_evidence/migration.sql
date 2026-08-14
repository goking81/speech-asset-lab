-- CreateTable
CREATE TABLE "AssetUsageAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetUsageResultId" TEXT NOT NULL,
    "personalAssetVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isCompleteInvocation" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetUsageAssessment_assetUsageResultId_fkey" FOREIGN KEY ("assetUsageResultId") REFERENCES "AssetUsageResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetUsageAssessment_personalAssetVersionId_fkey" FOREIGN KEY ("personalAssetVersionId") REFERENCES "PersonalAssetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NodeUsageEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetUsageAssessmentId" TEXT NOT NULL,
    "personalAssetNodeId" TEXT NOT NULL,
    "answerUnitId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "explanation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NodeUsageEvidence_assetUsageAssessmentId_fkey" FOREIGN KEY ("assetUsageAssessmentId") REFERENCES "AssetUsageAssessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NodeUsageEvidence_personalAssetNodeId_fkey" FOREIGN KEY ("personalAssetNodeId") REFERENCES "PersonalAssetNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NodeUsageEvidence_answerUnitId_fkey" FOREIGN KEY ("answerUnitId") REFERENCES "AnswerUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ObligationCoverage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetUsageResultId" TEXT NOT NULL,
    "questionObligationId" TEXT NOT NULL,
    "answerUnitId" TEXT,
    "status" TEXT NOT NULL,
    "explanation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObligationCoverage_assetUsageResultId_fkey" FOREIGN KEY ("assetUsageResultId") REFERENCES "AssetUsageResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ObligationCoverage_questionObligationId_fkey" FOREIGN KEY ("questionObligationId") REFERENCES "QuestionObligation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ObligationCoverage_answerUnitId_fkey" FOREIGN KEY ("answerUnitId") REFERENCES "AnswerUnit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AssetUsageAssessment_personalAssetVersionId_createdAt_idx" ON "AssetUsageAssessment"("personalAssetVersionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetUsageAssessment_assetUsageResultId_personalAssetVersionId_key" ON "AssetUsageAssessment"("assetUsageResultId", "personalAssetVersionId");

-- CreateIndex
CREATE INDEX "NodeUsageEvidence_personalAssetNodeId_answerUnitId_idx" ON "NodeUsageEvidence"("personalAssetNodeId", "answerUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeUsageEvidence_assetUsageAssessmentId_personalAssetNodeId_answerUnitId_key" ON "NodeUsageEvidence"("assetUsageAssessmentId", "personalAssetNodeId", "answerUnitId");

-- CreateIndex
CREATE INDEX "ObligationCoverage_questionObligationId_status_idx" ON "ObligationCoverage"("questionObligationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ObligationCoverage_assetUsageResultId_questionObligationId_key" ON "ObligationCoverage"("assetUsageResultId", "questionObligationId");
