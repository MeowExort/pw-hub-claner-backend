/*
  Warnings:

  - A unique constraint covering the columns `[shortId]` on the table `Character` will be added. If there are existing duplicate values, this will fail.
  - The required column `shortId` was added to the `Character` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "shortId" TEXT;

-- Update existing rows with a unique value using gen_random_uuid() or similar
-- Since we are on PostgreSQL, we can use gen_random_uuid() or just use id (which is uuid)
UPDATE "Character" SET "shortId" = "id";

-- Make it NOT NULL
ALTER TABLE "Character" ALTER COLUMN "shortId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Character_shortId_key" ON "Character"("shortId");
