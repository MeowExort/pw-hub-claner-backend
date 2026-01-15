/*
  Warnings:

  - A unique constraint covering the columns `[clanHallId,characterId,stage,createdAt]` on the table `ClanHallProgress` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ClanHallProgress_clanHallId_characterId_stage_key";

-- CreateIndex
CREATE UNIQUE INDEX "ClanHallProgress_clanHallId_characterId_stage_createdAt_key" ON "ClanHallProgress"("clanHallId", "characterId", "stage", "createdAt");
