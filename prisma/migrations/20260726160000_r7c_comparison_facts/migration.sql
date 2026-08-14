-- CreateTable
CREATE TABLE "DimensionComparison" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerComparisonResultId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "firstRating" INTEGER,
    "secondRating" INTEGER,
    "firstStatus" TEXT NOT NULL,
    "secondStatus" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    CONSTRAINT "DimensionComparison_answerComparisonResultId_fkey" FOREIGN KEY ("answerComparisonResultId") REFERENCES "AnswerComparisonResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ObligationChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerComparisonResultId" TEXT NOT NULL,
    "questionObligationId" TEXT NOT NULL,
    "firstStatus" TEXT NOT NULL,
    "secondStatus" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    CONSTRAINT "ObligationChange_answerComparisonResultId_fkey" FOREIGN KEY ("answerComparisonResultId") REFERENCES "AnswerComparisonResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ObligationChange_questionObligationId_fkey" FOREIGN KEY ("questionObligationId") REFERENCES "QuestionObligation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NodeChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerComparisonResultId" TEXT NOT NULL,
    "personalAssetNodeId" TEXT NOT NULL,
    "firstUsed" BOOLEAN NOT NULL,
    "secondUsed" BOOLEAN NOT NULL,
    "changeType" TEXT NOT NULL,
    CONSTRAINT "NodeChange_answerComparisonResultId_fkey" FOREIGN KEY ("answerComparisonResultId") REFERENCES "AnswerComparisonResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NodeChange_personalAssetNodeId_fkey" FOREIGN KEY ("personalAssetNodeId") REFERENCES "PersonalAssetNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DimensionComparison_dimension_changeType_idx" ON "DimensionComparison"("dimension", "changeType");

-- CreateIndex
CREATE UNIQUE INDEX "DimensionComparison_answerComparisonResultId_dimension_key" ON "DimensionComparison"("answerComparisonResultId", "dimension");

-- CreateIndex
CREATE INDEX "ObligationChange_questionObligationId_changeType_idx" ON "ObligationChange"("questionObligationId", "changeType");

-- CreateIndex
CREATE UNIQUE INDEX "ObligationChange_answerComparisonResultId_questionObligationId_key" ON "ObligationChange"("answerComparisonResultId", "questionObligationId");

-- CreateIndex
CREATE INDEX "NodeChange_personalAssetNodeId_changeType_idx" ON "NodeChange"("personalAssetNodeId", "changeType");

-- CreateIndex
CREATE UNIQUE INDEX "NodeChange_answerComparisonResultId_personalAssetNodeId_key" ON "NodeChange"("answerComparisonResultId", "personalAssetNodeId");
