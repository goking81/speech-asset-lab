-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BackupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MANUAL',
    "formatVersion" INTEGER NOT NULL DEFAULT 1,
    "scopeJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "contentHash" TEXT,
    "sizeBytes" INTEGER,
    "errorMessage" TEXT,
    "restoredAt" DATETIME,
    "restorePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackupRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BackupRecord" ("contentHash", "createdAt", "errorMessage", "filePath", "id", "restoredAt", "sizeBytes", "status", "userId") SELECT "contentHash", "createdAt", "errorMessage", "filePath", "id", "restoredAt", "sizeBytes", "status", "userId" FROM "BackupRecord";
DROP TABLE "BackupRecord";
ALTER TABLE "new_BackupRecord" RENAME TO "BackupRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
