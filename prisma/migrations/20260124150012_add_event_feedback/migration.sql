-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "feedbackSubmitted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EventParticipant" ADD COLUMN     "isReplacement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Squad" ADD COLUMN     "feedbackSubmitted" BOOLEAN NOT NULL DEFAULT false;
