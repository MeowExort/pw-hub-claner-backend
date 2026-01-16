-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "telegramRallyGroupMessageId" TEXT;

-- AlterTable
ALTER TABLE "EventParticipant" ADD COLUMN     "telegramRallyMessageId" TEXT;
