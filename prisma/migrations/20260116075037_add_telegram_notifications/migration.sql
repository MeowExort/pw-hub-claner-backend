/*
  Warnings:

  - A unique constraint covering the columns `[telegramId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Clan" ADD COLUMN     "telegramGroupId" TEXT,
ADD COLUMN     "telegramThreadId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "telegramId" TEXT,
ADD COLUMN     "telegramUsername" TEXT;

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clanApplications" BOOLEAN NOT NULL DEFAULT true,
    "applicationDecision" BOOLEAN NOT NULL DEFAULT true,
    "attendanceMarking" BOOLEAN NOT NULL DEFAULT true,
    "pvpEventCreated" BOOLEAN NOT NULL DEFAULT true,
    "pvpEventRally" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationVote" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,

    CONSTRAINT "ApplicationVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_userId_key" ON "NotificationSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationVote_applicationId_characterId_key" ON "ApplicationVote"("applicationId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationVote" ADD CONSTRAINT "ApplicationVote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ClanApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationVote" ADD CONSTRAINT "ApplicationVote_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
