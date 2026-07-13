-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "lastKnownIp" TEXT;

-- CreateTable
CREATE TABLE "IpChangeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "previousIp" TEXT NOT NULL,
    "newIp" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "IpChangeEvent_userId_detectedAt_idx" ON "IpChangeEvent"("userId", "detectedAt");
