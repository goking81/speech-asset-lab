CREATE TABLE "AiGoldenSetCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "expectationJson" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "AiGoldenSetRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aiReleaseBundleId" TEXT NOT NULL,
    "providerKey" TEXT,
    "modelName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "gateStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "failureSummary" TEXT,
    "runtimeJson" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "AiGoldenSetRun_aiReleaseBundleId_fkey" FOREIGN KEY ("aiReleaseBundleId") REFERENCES "AiReleaseBundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AiGoldenSetResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aiGoldenSetRunId" TEXT NOT NULL,
    "aiGoldenSetCaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outputKind" TEXT,
    "outputDigest" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiGoldenSetResult_aiGoldenSetRunId_fkey" FOREIGN KEY ("aiGoldenSetRunId") REFERENCES "AiGoldenSetRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiGoldenSetResult_aiGoldenSetCaseId_fkey" FOREIGN KEY ("aiGoldenSetCaseId") REFERENCES "AiGoldenSetCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AiProviderCompatibility" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fallbackStatus" TEXT NOT NULL,
    "failureCode" TEXT,
    "runtimeJson" TEXT NOT NULL,
    "testedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AiReleaseAuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aiReleaseBundleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "detailJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiReleaseAuditEvent_aiReleaseBundleId_fkey" FOREIGN KEY ("aiReleaseBundleId") REFERENCES "AiReleaseBundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiGoldenSetCase_key_version_key" ON "AiGoldenSetCase"("key", "version");
CREATE INDEX "AiGoldenSetCase_role_isEnabled_idx" ON "AiGoldenSetCase"("role", "isEnabled");
CREATE INDEX "AiGoldenSetRun_aiReleaseBundleId_completedAt_idx" ON "AiGoldenSetRun"("aiReleaseBundleId", "completedAt");
CREATE UNIQUE INDEX "AiGoldenSetResult_aiGoldenSetRunId_aiGoldenSetCaseId_key" ON "AiGoldenSetResult"("aiGoldenSetRunId", "aiGoldenSetCaseId");
CREATE INDEX "AiGoldenSetResult_aiGoldenSetCaseId_status_idx" ON "AiGoldenSetResult"("aiGoldenSetCaseId", "status");
CREATE UNIQUE INDEX "AiProviderCompatibility_userId_providerKey_modelName_key" ON "AiProviderCompatibility"("userId", "providerKey", "modelName");
CREATE INDEX "AiProviderCompatibility_userId_testedAt_idx" ON "AiProviderCompatibility"("userId", "testedAt");
CREATE INDEX "AiReleaseAuditEvent_aiReleaseBundleId_createdAt_idx" ON "AiReleaseAuditEvent"("aiReleaseBundleId", "createdAt");
