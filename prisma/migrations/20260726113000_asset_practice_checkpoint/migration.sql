-- P05 当前步骤与未提交草稿恢复检查点；历史 Attempt 仍保持追加式保存。
CREATE TABLE "AssetPracticeCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetPracticeSessionId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssetPracticeCheckpoint_assetPracticeSessionId_fkey" FOREIGN KEY ("assetPracticeSessionId") REFERENCES "AssetPracticeSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssetPracticeCheckpoint_assetPracticeSessionId_key" ON "AssetPracticeCheckpoint"("assetPracticeSessionId");
