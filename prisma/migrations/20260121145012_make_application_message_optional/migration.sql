/*
  Warnings:

  - You are about to drop the column `level` on the `Character` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Character" DROP COLUMN "level";

-- AlterTable
ALTER TABLE "ClanApplication" ALTER COLUMN "message" DROP NOT NULL;
