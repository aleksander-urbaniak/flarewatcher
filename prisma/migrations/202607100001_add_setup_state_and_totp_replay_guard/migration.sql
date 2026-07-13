-- AlterTable
ALTER TABLE "User" ADD COLUMN "twoFactorLastStep" INTEGER;

-- CreateTable
CREATE TABLE "SetupState" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
