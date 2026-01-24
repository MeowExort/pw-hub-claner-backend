-- CreateIndex
CREATE INDEX "ApplicationVote_applicationId_idx" ON "ApplicationVote"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationVote_characterId_idx" ON "ApplicationVote"("characterId");

-- CreateIndex
CREATE INDEX "AuditLog_clanId_idx" ON "AuditLog"("clanId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "Character_userId_idx" ON "Character"("userId");

-- CreateIndex
CREATE INDEX "Character_clanId_idx" ON "Character"("clanId");

-- CreateIndex
CREATE INDEX "CharacterHistory_characterId_idx" ON "CharacterHistory"("characterId");

-- CreateIndex
CREATE INDEX "ClanApplication_clanId_idx" ON "ClanApplication"("clanId");

-- CreateIndex
CREATE INDEX "ClanApplication_characterId_idx" ON "ClanApplication"("characterId");

-- CreateIndex
CREATE INDEX "ClanApplication_status_idx" ON "ClanApplication"("status");

-- CreateIndex
CREATE INDEX "ClanHall_contextId_idx" ON "ClanHall"("contextId");

-- CreateIndex
CREATE INDEX "ClanHallProgress_clanHallId_idx" ON "ClanHallProgress"("clanHallId");

-- CreateIndex
CREATE INDEX "ClanHallProgress_characterId_idx" ON "ClanHallProgress"("characterId");

-- CreateIndex
CREATE INDEX "ClanWeeklyContext_clanId_idx" ON "ClanWeeklyContext"("clanId");

-- CreateIndex
CREATE INDEX "ClanWeeklyContext_weekIso_idx" ON "ClanWeeklyContext"("weekIso");

-- CreateIndex
CREATE INDEX "Event_contextId_idx" ON "Event"("contextId");

-- CreateIndex
CREATE INDEX "Event_date_idx" ON "Event"("date");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "EventParticipant_eventId_idx" ON "EventParticipant"("eventId");

-- CreateIndex
CREATE INDEX "EventParticipant_characterId_idx" ON "EventParticipant"("characterId");

-- CreateIndex
CREATE INDEX "FactionHistory_clanId_idx" ON "FactionHistory"("clanId");

-- CreateIndex
CREATE INDEX "ForbiddenKnowledge_characterId_idx" ON "ForbiddenKnowledge"("characterId");

-- CreateIndex
CREATE INDEX "ForbiddenKnowledge_contextId_idx" ON "ForbiddenKnowledge"("contextId");

-- CreateIndex
CREATE INDEX "NotificationSettings_userId_idx" ON "NotificationSettings"("userId");

-- CreateIndex
CREATE INDEX "Rhythm_characterId_idx" ON "Rhythm"("characterId");

-- CreateIndex
CREATE INDEX "Rhythm_contextId_idx" ON "Rhythm"("contextId");

-- CreateIndex
CREATE INDEX "Squad_eventId_idx" ON "Squad"("eventId");

-- CreateIndex
CREATE INDEX "TaskLog_taskName_idx" ON "TaskLog"("taskName");

-- CreateIndex
CREATE INDEX "TaskLog_status_idx" ON "TaskLog"("status");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");
