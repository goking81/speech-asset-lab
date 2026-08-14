PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CandidateAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceAssetVersionId" TEXT,
    "title" TEXT NOT NULL,
    "coreIdea" TEXT NOT NULL,
    "flowText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "modelDraftJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CandidateAsset_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateAsset_sourceAssetVersionId_fkey" FOREIGN KEY ("sourceAssetVersionId") REFERENCES "SourceAssetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_CandidateAsset" ("coreIdea", "createdAt", "flowText", "id", "modelDraftJson", "sourceDocumentId", "status", "title", "updatedAt")
SELECT "coreIdea", "createdAt", "flowText", "id", "modelDraftJson", "sourceDocumentId", "status", "title", "updatedAt" FROM "CandidateAsset";

DROP TABLE "CandidateAsset";
ALTER TABLE "new_CandidateAsset" RENAME TO "CandidateAsset";
CREATE UNIQUE INDEX "CandidateAsset_sourceAssetVersionId_key" ON "CandidateAsset"("sourceAssetVersionId");

PRAGMA foreign_keys=ON;
