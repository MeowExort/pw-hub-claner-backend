-- AlterTable
ALTER TABLE "Character" ALTER COLUMN "shortId" DROP NOT NULL;

-- Seed shortId for existing rows that might have NULL (though NOT NULL was dropped)
-- Just in case some rows are missing it
UPDATE "Character" SET "shortId" = "id" WHERE "shortId" IS NULL;
