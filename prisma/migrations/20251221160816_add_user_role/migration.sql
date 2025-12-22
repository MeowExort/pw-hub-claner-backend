/*
  Warnings:

  - You are about to drop the column `circles` on the `ForbiddenKnowledge` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ForbiddenKnowledge" DROP COLUMN "circles";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'USER';
