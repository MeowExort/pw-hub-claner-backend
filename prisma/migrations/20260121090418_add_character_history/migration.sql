-- CreateTable
CREATE TABLE "CharacterHistory" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "oldData" JSONB NOT NULL,
    "newData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CharacterHistory" ADD CONSTRAINT "CharacterHistory_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterHistory" ADD CONSTRAINT "CharacterHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
