-- 保持本机 SQLite 与云端 Prisma 模型一致；本机流程不写入此字段。
ALTER TABLE "ImportBatchFile" ADD COLUMN "storageObjectKey" TEXT;

CREATE UNIQUE INDEX "ImportBatchFile_storageObjectKey_key"
  ON "ImportBatchFile"("storageObjectKey");
