-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "monitoredRecords" JSONB NOT NULL DEFAULT [],
    "alertEmail" TEXT,
    "telegramBotToken" TEXT,
    "telegramChatId" TEXT,
    "discordWebhookUrl" TEXT,
    "discordMarkdown" TEXT,
    "discordEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpFrom" TEXT,
    "smtpTo" TEXT,
    "smtpMessage" TEXT,
    "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnIpChange" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("alertEmail", "discordEnabled", "discordMarkdown", "discordWebhookUrl", "id", "intervalMinutes", "monitoredRecords", "notifyOnFailure", "notifyOnIpChange", "smtpEnabled", "smtpFrom", "smtpHost", "smtpMessage", "smtpPass", "smtpPort", "smtpTo", "smtpUser", "telegramBotToken", "telegramChatId", "updatedAt", "userId") SELECT "alertEmail", "discordEnabled", "discordMarkdown", "discordWebhookUrl", "id", "intervalMinutes", "monitoredRecords", "notifyOnFailure", "notifyOnIpChange", "smtpEnabled", "smtpFrom", "smtpHost", "smtpMessage", "smtpPass", "smtpPort", "smtpTo", "smtpUser", "telegramBotToken", "telegramChatId", "updatedAt", "userId" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
