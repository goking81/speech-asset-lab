-- CreateTable
CREATE TABLE "EvaluationIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerEvaluationResultId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "issueCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationIssue_answerEvaluationResultId_fkey" FOREIGN KEY ("answerEvaluationResultId") REFERENCES "AnswerEvaluationResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerEvaluationResultId" TEXT NOT NULL,
    "evaluationIssueId" TEXT,
    "dimension" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recommendation_answerEvaluationResultId_fkey" FOREIGN KEY ("answerEvaluationResultId") REFERENCES "AnswerEvaluationResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_evaluationIssueId_fkey" FOREIGN KEY ("evaluationIssueId") REFERENCES "EvaluationIssue" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Correction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerEvaluationResultId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "dimension" TEXT NOT NULL,
    "answerUnitId" TEXT NOT NULL,
    "replacementText" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Correction_answerEvaluationResultId_fkey" FOREIGN KEY ("answerEvaluationResultId") REFERENCES "AnswerEvaluationResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Correction_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Correction_answerUnitId_fkey" FOREIGN KEY ("answerUnitId") REFERENCES "AnswerUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AnswerDimensionRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerEvaluationResultId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NOT_EVALUABLE',
    "source" TEXT NOT NULL,
    "evidenceJson" TEXT,
    CONSTRAINT "AnswerDimensionRating_answerEvaluationResultId_fkey" FOREIGN KEY ("answerEvaluationResultId") REFERENCES "AnswerEvaluationResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AnswerDimensionRating" ("answerEvaluationResultId", "dimension", "evidenceJson", "id", "rating", "source") SELECT "answerEvaluationResultId", "dimension", "evidenceJson", "id", "rating", "source" FROM "AnswerDimensionRating";
DROP TABLE "AnswerDimensionRating";
ALTER TABLE "new_AnswerDimensionRating" RENAME TO "AnswerDimensionRating";
CREATE UNIQUE INDEX "AnswerDimensionRating_answerEvaluationResultId_dimension_key" ON "AnswerDimensionRating"("answerEvaluationResultId", "dimension");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EvaluationIssue_answerEvaluationResultId_dimension_idx" ON "EvaluationIssue"("answerEvaluationResultId", "dimension");

-- CreateIndex
CREATE INDEX "Recommendation_answerEvaluationResultId_dimension_idx" ON "Recommendation"("answerEvaluationResultId", "dimension");

-- CreateIndex
CREATE INDEX "Correction_answerEvaluationResultId_dimension_idx" ON "Correction"("answerEvaluationResultId", "dimension");
