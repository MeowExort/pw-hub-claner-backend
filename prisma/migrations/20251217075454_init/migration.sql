-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "mainCharacterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "server" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "pwobsLink" TEXT NOT NULL DEFAULT '',
    "gameCharId" TEXT NOT NULL DEFAULT '',
    "level" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minAttack" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxAttack" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "critChance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "critDamage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spirit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "physPenetration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "magPenetration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "levelBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chanting" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atkPerSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attackLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "health" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "physDef" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "magDef" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defenseLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "physReduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "magReduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "clanId" TEXT,
    "clanRole" TEXT,
    "clanJoinDate" TIMESTAMP(3),

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "server" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Clan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanWeeklyContext" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "dateStart" TIMESTAMP(3) NOT NULL,
    "dateEnd" TIMESTAMP(3) NOT NULL,
    "weekIso" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,

    CONSTRAINT "ClanWeeklyContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rhythm" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rhythm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForbiddenKnowledge" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "circles" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForbiddenKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanHall" (
    "id" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,

    CONSTRAINT "ClanHall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanHallProgress" (
    "id" TEXT NOT NULL,
    "clanHallId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,
    "gold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanHallProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "rallyTime" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "opponent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attendance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Squad" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "members" TEXT[],

    CONSTRAINT "Squad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanApplication" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactionHistory" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "characterId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "param0" INTEGER NOT NULL,
    "param1" INTEGER NOT NULL,
    "param2" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLog" (
    "id" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "logs" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,

    CONSTRAINT "TaskLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ClanWeeklyContext_clanId_weekIso_key" ON "ClanWeeklyContext"("clanId", "weekIso");

-- CreateIndex
CREATE UNIQUE INDEX "Rhythm_contextId_characterId_key" ON "Rhythm"("contextId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "ForbiddenKnowledge_contextId_characterId_key" ON "ForbiddenKnowledge"("contextId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "ClanHall_contextId_key" ON "ClanHall"("contextId");

-- CreateIndex
CREATE UNIQUE INDEX "ClanHallProgress_clanHallId_characterId_stage_key" ON "ClanHallProgress"("clanHallId", "characterId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_characterId_key" ON "EventParticipant"("eventId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "FactionHistory_clanId_recordId_key" ON "FactionHistory"("clanId", "recordId");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanWeeklyContext" ADD CONSTRAINT "ClanWeeklyContext_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rhythm" ADD CONSTRAINT "Rhythm_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rhythm" ADD CONSTRAINT "Rhythm_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "ClanWeeklyContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForbiddenKnowledge" ADD CONSTRAINT "ForbiddenKnowledge_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForbiddenKnowledge" ADD CONSTRAINT "ForbiddenKnowledge_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "ClanWeeklyContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanHall" ADD CONSTRAINT "ClanHall_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "ClanWeeklyContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanHallProgress" ADD CONSTRAINT "ClanHallProgress_clanHallId_fkey" FOREIGN KEY ("clanHallId") REFERENCES "ClanHall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanHallProgress" ADD CONSTRAINT "ClanHallProgress_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "ClanWeeklyContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Squad" ADD CONSTRAINT "Squad_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanApplication" ADD CONSTRAINT "ClanApplication_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanApplication" ADD CONSTRAINT "ClanApplication_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactionHistory" ADD CONSTRAINT "FactionHistory_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
