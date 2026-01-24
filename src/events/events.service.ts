import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { RsvpDto } from './dto/rsvp.dto';
import { SquadDto } from './dto/squad.dto';
import { EventFeedbackDto } from './dto/event-feedback.dto';
import { ClanPermission } from '../common/constants/permissions';
import { AuditService } from '../audit/audit.service';
import { TelegramService } from '../telegram/telegram.service';
import { Markup } from 'telegraf';

function getWeekIso(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

@Injectable()
export class EventsService {
  constructor(
      private prisma: PrismaService,
      private audit: AuditService,
      private telegram: TelegramService
  ) {}

  hasPermission(character: any, permission: string): boolean {
      console.log();
      console.log();
      console.log(character, permission);
      if (!character.clan || !character.clanRole) return false;
      if (character.clanRole === 'MASTER') return true;
      
      const settings = character.clan.settings as any;
      if (!settings || !settings.rolePermissions) return false;

      const rolePerms = settings.rolePermissions.find((rp: any) => rp.role === character.clanRole);
      
      if (!rolePerms) return false;
      if (rolePerms.permissions.includes('ALL')) return true;
      return rolePerms.permissions.includes(permission);
  }

  async findAll(actor: any, options: { limit?: number, offset?: number, history?: boolean } = {}) {
    if (!actor.clanId) return [];
    
    const now = new Date();
    const where: any = {
        clanWeeklyContext: {
            clanId: actor.clanId
        }
    };

    if (options.history) {
        where.date = { lt: now };
    } else {
        where.OR = [
            { date: { gte: now } },
            { feedbackSubmitted: false, date: { lt: now } }
        ];
    }
    
    return this.prisma.event.findMany({
        where,
        include: {
            participants: true,
            squads: true
        },
        orderBy: {
            date: options.history ? 'desc' : 'asc'
        },
        take: options.limit,
        skip: options.offset
    });
  }

  async findOne(id: string, actor: any) {
    const event = await this.prisma.event.findUnique({
        where: { id },
        include: {
            participants: true,
            squads: true,
            clanWeeklyContext: true
        }
    });
    
    if (!event) throw new NotFoundException('Event not found');
    if (event.clanWeeklyContext.clanId !== actor.clanId) throw new ForbiddenException('Access denied');
    
    return event;
  }

  async create(dto: CreateEventDto, actor: any) {
      if (!actor.clanId) throw new BadRequestException('Not in a clan');
      
      const date = new Date(dto.date);
      const weekIso = getWeekIso(date);
      
      let context = await this.prisma.clanWeeklyContext.findUnique({
          where: { clanId_weekIso: { clanId: actor.clanId, weekIso } }
      });
      
      if (!context) {
          const [yearStr, weekStr] = weekIso.split('-W');
          const year = parseInt(yearStr, 10);
          const weekNum = parseInt(weekStr, 10);
          
          const simple = new Date(Date.UTC(year, 0, 4));
          const dayOfWeek = simple.getUTCDay() || 7; 
          simple.setUTCDate(simple.getUTCDate() + (weekNum - 1) * 7 - dayOfWeek + 1);
          const startOfWeek = simple;
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 7);
          endOfWeek.setMilliseconds(-1);

          context = await this.prisma.clanWeeklyContext.create({
              data: {
                  clanId: actor.clanId,
                  weekIso,
                  weekNumber: weekNum,
                  dateStart: startOfWeek,
                  dateEnd: endOfWeek,
                  clanHall: { create: {} }
              }
          });
      }

      const event = await this.prisma.event.create({
          data: {
              contextId: context.id,
              type: dto.type,
              name: dto.name,
              description: dto.description,
              date: date,
              rallyTime: dto.rallyTime ? new Date(dto.rallyTime) : null,
              status: 'UPCOMING',
              opponent: dto.opponent,
              updatedBy: actor.id
          },
          include: {
              clanWeeklyContext: { include: { clan: true } }
          }
      });
      
      await this.audit.log(actor.clanId, actor.id, 'CREATE_EVENT', event.name);

      // Notify members in background
      this.notifyMembersAboutEvent(event).catch(() => {});

      return event;
  }

  private async notifyMembersAboutEvent(event: any) {
    const clan = event.clanWeeklyContext.clan;
    const members = await this.prisma.character.findMany({
        where: { clanId: clan.id },
        include: { user: { include: { notificationSettings: true } } }
    });

    const dateStr = new Date(event.date).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const rallyStr = event.rallyTime ? new Date(event.rallyTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : 'не указано';
    
    const baseMessage = `<b>Новое событие: ${event.name}</b>\nТип: ${event.type}\nДата: ${dateStr}\nСбор: ${rallyStr}\n${event.description ? `\n${event.description}` : ''}`;

    // Process each member in background
    members.forEach(member => {
        if (member.user.telegramId && member.user.notificationSettings?.pvpEventCreated) {
            const personalMessage = baseMessage + `\n\nПерсонаж: <code>${member.name}</code>`;
            const memberKeyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Иду', `event_rsvp:${event.id}:${member.shortId || member.id}:GOING`),
                    Markup.button.callback('❌ Не пойду', `event_rsvp:${event.id}:${member.shortId || member.id}:NOT_GOING`)
                ]
            ]);
            
            this.telegram.sendMessage(member.user.telegramId, personalMessage, memberKeyboard).then(sent => {
                if (sent) {
                    this.prisma.eventParticipant.upsert({
                        where: {
                            eventId_characterId: {
                                eventId: event.id,
                                characterId: member.id
                            }
                        },
                        create: {
                            eventId: event.id,
                            characterId: member.id,
                            status: 'UNDECIDED',
                            telegramMessageId: sent.message_id.toString()
                        },
                        update: {
                            telegramMessageId: sent.message_id.toString()
                        }
                    }).catch(() => {});
                }
            }).catch(() => {});
        }
    });

    // Notify Group in background
    if (clan.telegramGroupId) {
        const groupKeyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Иду 0', `event_rsvp:${event.id}:GOING`),
                Markup.button.callback('❌ Не пойду 0', `event_rsvp:${event.id}:NOT_GOING`)
            ]
        ]);
        this.telegram.sendMessage(clan.telegramGroupId, baseMessage, {
            ...groupKeyboard,
            message_thread_id: clan.telegramThreadId
        }).then(groupMessage => {
            if (groupMessage) {
                this.prisma.event.update({
                    where: { id: event.id },
                    data: { telegramGroupMessageId: groupMessage.message_id.toString() }
                }).then(() => {
                    if (!clan.telegramThreadId) {
                        this.telegram.pinMessage(clan.telegramGroupId, groupMessage.message_id).catch(() => {});
                    }
                }).catch(() => {});
            }
        }).catch(() => {});
    }
  }

  async createSystemEvent(clanId: string, dto: CreateEventDto) {
      const date = new Date(dto.date);
      const weekIso = getWeekIso(date);
      
      let context = await this.prisma.clanWeeklyContext.findUnique({
          where: { clanId_weekIso: { clanId, weekIso } }
      });
      
      if (!context) {
           const [yearStr, weekStr] = weekIso.split('-W');
          const year = parseInt(yearStr, 10);
          const weekNum = parseInt(weekStr, 10);
          
          const simple = new Date(Date.UTC(year, 0, 4));
          const dayOfWeek = simple.getUTCDay() || 7; 
          simple.setUTCDate(simple.getUTCDate() + (weekNum - 1) * 7 - dayOfWeek + 1);
          const startOfWeek = simple;
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 7);
          endOfWeek.setMilliseconds(-1);

          context = await this.prisma.clanWeeklyContext.create({
              data: {
                  clanId,
                  weekIso,
                  weekNumber: weekNum,
                  dateStart: startOfWeek,
                  dateEnd: endOfWeek,
                  clanHall: { create: {} }
              }
          });
      }

      return this.prisma.event.create({
          data: {
              contextId: context.id,
              type: dto.type,
              name: dto.name,
              description: dto.description,
              date: date,
              rallyTime: dto.rallyTime ? new Date(dto.rallyTime) : null,
              status: 'UPCOMING',
              opponent: dto.opponent
          }
      });
  }

  async rsvp(userId: string, eventId: string, dto: RsvpDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { clanWeeklyContext: { include: { clan: true } } },
    });
    if (!event) throw new NotFoundException('Event not found');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { characters: true },
    });
    const charId = user?.mainCharacterId;
    if (!charId) throw new BadRequestException('No character selected');

    const character = user.characters.find((c) => c.id === charId);
    if (!character || character.clanId !== event.clanWeeklyContext.clanId) {
      throw new ForbiddenException('Character is not in the clan for this event');
    }

    await this.prisma.eventParticipant.upsert({
      where: {
        eventId_characterId: {
          eventId,
          characterId: charId,
        },
      },
      create: {
        eventId,
        characterId: charId,
        status: dto.status,
      },
      update: {
        status: dto.status,
      },
    });

    // Trigger Telegram updates
    await this.updateTelegramMessages(eventId, charId);

    return this.prisma.event.findUnique({ where: { id: eventId }, include: { participants: true } });
  }

  async updateTelegramMessages(eventId: string, characterId: string) {
      const event = await this.prisma.event.findUnique({
          where: { id: eventId },
          include: { 
              participants: { include: { character: { include: { user: true } } } },
              clanWeeklyContext: { include: { clan: true } },
              squads: true
          }
      });
      if (!event) return;

      const participant = event.participants.find(p => p.characterId === characterId);
      
      // 1. Update Personal Message
      if (participant?.character?.user?.telegramId && participant.telegramMessageId) {
          const dateStr = new Date(event.date).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
          const rallyStr = event.rallyTime ? new Date(event.rallyTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : 'не указано';
          const baseMessage = `<b>Новое событие: ${event.name}</b>\nТип: ${event.type}\nДата: ${dateStr}\nСбор: ${rallyStr}\n${event.description ? `\n${event.description}` : ''}`;
          
          let personalText = baseMessage + `\n\nПерсонаж: <code>${participant.character.name}</code>`;
          const statusText = participant.status === 'GOING' ? 'Вы идете ✅' : (participant.status === 'NOT_GOING' ? 'Вы не идете ❌' : 'Вы еще не определились ❓');
          personalText += `\n\nСтатус: <b>${statusText}</b>`;

          const squad = event.squads.find(s => s.members.includes(characterId));
          let copyExtra = '';
          if (squad) {
              let leaderName = 'Не указан';
              if (squad.leaderId) {
                  const leader = event.participants.find(p => p.characterId === squad.leaderId)?.character;
                  leaderName = leader?.name || 'Не указан';
              }
              personalText += `\n\nВас расписали в отряд!\nОтряд: <b>${squad.name}</b>\nПЛ: <code>${leaderName}</code>`;

              if (characterId === squad.leaderId) {
                  const memberNames = [];
                  for (const mId of squad.members) {
                      if (mId === squad.leaderId) continue;
                      const mChar = event.participants.find(p => p.characterId === mId)?.character;
                      memberNames.push(mChar?.name || 'Unknown');
                  }
                  const copyString = `${squad.name}: ${memberNames.join(', ')}`;
                  copyExtra = `\n\n<b>Список для копирования:</b>\n<code>${copyString}</code>`;
              }
          }

          const keyboard = Markup.inlineKeyboard([
              [
                  Markup.button.callback('🔄 Изменить решение', `event_rsvp:${event.id}:${participant.character.shortId || characterId}:${participant.status === 'GOING' ? 'NOT_GOING' : 'GOING'}`)
              ]
          ]);

          await this.telegram.editMessage(participant.character.user.telegramId, parseInt(participant.telegramMessageId), personalText + copyExtra, keyboard);
      }

      // 2. Update Group Message
      if (event.clanWeeklyContext.clan.telegramGroupId && event.telegramGroupMessageId) {
          const dateStr = new Date(event.date).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
          const rallyStr = event.rallyTime ? new Date(event.rallyTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : 'не указано';
          const baseMessage = `<b>Новое событие: ${event.name}</b>\nТип: ${event.type}\nДата: ${dateStr}\nСбор: ${rallyStr}\n${event.description ? `\n${event.description}` : ''}`;

          const goingCount = event.participants.filter(p => p.status === 'GOING').length;
          const notGoingCount = event.participants.filter(p => p.status === 'NOT_GOING').length;

          const groupKeyboard = Markup.inlineKeyboard([
              [
                  Markup.button.callback(`✅ Иду ${goingCount}`, `event_rsvp:${event.id}:GOING`),
                  Markup.button.callback(`❌ Не пойду ${notGoingCount}`, `event_rsvp:${event.id}:NOT_GOING`)
              ]
          ]);

          await this.telegram.editMessage(
              event.clanWeeklyContext.clan.telegramGroupId, 
              parseInt(event.telegramGroupMessageId), 
              baseMessage, 
              groupKeyboard
          );
      }
  }

  async setSquads(userId: string, eventId: string, squads: SquadDto[], actor: any) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { clanWeeklyContext: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mainCharacterId) throw new BadRequestException('No active character selected');

    // actor comes from PermissionsGuard, which uses mainCharacterId,
    // so actor.id is already the mainCharacterId of the person making the request.
    if (event.clanWeeklyContext.clanId !== actor.clanId) {
      throw new ForbiddenException('Access denied: Event belongs to another clan');
    }

    // Replace existing squads with the provided list using proper nested writes
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        squads: {
          // Remove all existing squads of this event
          deleteMany: {},
          // Create new squads from DTO
          create: squads.map((sq) => ({
            name: sq.name || 'Unnamed Squad',
            leaderId: sq.leaderId || '',
            members: sq.members ?? [],
          })),
        },
      },
      include: {
        squads: true,
        clanWeeklyContext: { include: { clan: true } },
      },
    });

    await this.audit.log(actor.clanId, actor.id, 'UPDATE_SQUADS', event.name);

    // Notify users about squad assignment in background
    this.notifyMembersAboutSquads(updated).catch(() => {});

    return updated;
  }

  private async notifyMembersAboutSquads(event: any) {
      const squadMembersMap = new Map<string, { squadName: string, leaderId: string, squad: any }>();
      const allSquadMemberIds = new Set<string>();

      for (const squad of event.squads) {
          for (const charId of squad.members) {
              squadMembersMap.set(charId, { squadName: squad.name, leaderId: squad.leaderId, squad });
              allSquadMemberIds.add(charId);
          }
      }

      if (allSquadMemberIds.size === 0) return;

      const [characters, participants] = await Promise.all([
          this.prisma.character.findMany({
              where: { id: { in: Array.from(allSquadMemberIds) } },
              select: { id: true, name: true, shortId: true }
          }),
          this.prisma.eventParticipant.findMany({
              where: {
                  eventId: event.id,
                  characterId: { in: Array.from(allSquadMemberIds) }
              },
              include: {
                  character: { include: { user: { include: { notificationSettings: true } } } }
              }
          })
      ]);

      const charNameMap = new Map(characters.map(c => [c.id, c.name]));
      const dateStr = new Date(event.date).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      const rallyStr = event.rallyTime ? new Date(event.rallyTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : 'не указано';
      const eventBaseInfo = `<b>Новое событие: ${event.name}</b>\nТип: ${event.type}\nДата: ${dateStr}\nСбор: ${rallyStr}\n${event.description ? `\n${event.description}` : ''}`;

      // Process notifications in background
      participants.forEach(participant => {
          const charId = participant.characterId;
          const info = squadMembersMap.get(charId);
          if (!info || !participant.character.user.telegramId || !participant.telegramMessageId) return;

          const leaderName = charNameMap.get(info.leaderId) || 'Не указан';
          let message = eventBaseInfo + `\n\nПерсонаж: <code>${participant.character.name}</code>`;

          const statusText = participant.status === 'GOING' ? 'Вы идете ✅' : (participant.status === 'NOT_GOING' ? 'Вы не идете ❌' : '');
          if (statusText) {
              message += `\n\nСтатус: <b>${statusText}</b>`;
          }

          message += `\n\nВас расписали в отряд!\nОтряд: <b>${info.squadName}</b>\nПЛ: <code>${leaderName}</code>`;

          let copyExtra = '';
          const isPL = charId === info.leaderId;
          if (isPL) {
              const memberNames = info.squad.members
                  .filter(mId => mId !== info.leaderId)
                  .map(mId => charNameMap.get(mId) || 'Unknown');
              const copyString = `${info.squadName}: ${memberNames.join(', ')}`;
              copyExtra = `\n\n<b>Список для копирования:</b>\n<code>${copyString}</code>`;
          }

          const keyboard = Markup.inlineKeyboard([
              [
                  Markup.button.callback('🔄 Изменить решение', `event_rsvp:${event.id}:${participant.character.shortId || charId}:${participant.status === 'GOING' ? 'NOT_GOING' : 'GOING'}`)
              ]
          ]);

          this.telegram.editMessage(participant.character.user.telegramId, parseInt(participant.telegramMessageId), message + copyExtra, keyboard).catch(() => {});
      });
  }
  
  async completeEvent(userId: string, eventId: string, reportUploaded: boolean) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { clanWeeklyContext: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const charId = user?.mainCharacterId;

    if (!charId) throw new BadRequestException('No active character selected');

    // Fetch character with clan to verify membership and permissions
    const character = await this.prisma.character.findUnique({
      where: { id: charId },
      include: { clan: true },
    });

    if (!character || character.clanId !== event.clanWeeklyContext.clanId) {
      throw new ForbiddenException('Access denied: Character not in clan');
    }

    if (!this.hasPermission(character, ClanPermission.CAN_EDIT_EVENTS)) {
      throw new ForbiddenException('Insufficient permissions to complete event');
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        status: reportUploaded ? 'COMPLETED' : 'ACTIVE',
      },
    });

    await this.audit.log(event.clanWeeklyContext.clanId, charId, 'COMPLETE_EVENT', event.name);

    return updated;
  }

  async submitFeedback(userId: string, eventId: string, dto: EventFeedbackDto, actor: any, gateway?: any) {
      const event = await this.prisma.event.findUnique({
          where: { id: eventId },
          include: {
              squads: true,
              participants: true,
              clanWeeklyContext: true,
          },
      });

      if (!event) throw new NotFoundException('Event not found');
      if (new Date(event.date) > new Date()) {
          throw new BadRequestException('Cannot submit feedback for future event');
      }

      const isAdmin = this.hasPermission(actor, ClanPermission.CAN_EDIT_EVENTS);

      if (dto.squadId === 'ALL') {
          if (!isAdmin) throw new ForbiddenException('Only officers can submit feedback for all squads');
      } else {
          const squad = event.squads.find((s) => s.id === dto.squadId);
          if (!squad) throw new NotFoundException('Squad not found');
          if (!isAdmin && squad.leaderId !== actor.id) {
              throw new ForbiddenException('Only squad leader or officer can submit feedback');
          }
      }

      const result = await this.prisma.$transaction(async (tx) => {
          // 1. Process attendance data and collect replacements to add to squads
          const replacementsToAdd: string[] = [];
          const participantsToUpdate = [];
          const participantsToCreate = [];

          for (const item of dto.attendanceData) {
              const existing = event.participants.find((p) => p.characterId === item.characterId);

              // 1.1 Move character if it's a replacement and attended
              if (item.isReplacement && item.attended) {
                  const otherSquad = event.squads.find(s => s.members.includes(item.characterId) && s.id !== dto.squadId);
                  if (otherSquad) {
                      const newMembers = otherSquad.members.filter(id => id !== item.characterId);
                      const isLeader = otherSquad.leaderId === item.characterId;
                      await tx.squad.update({
                          where: { id: otherSquad.id },
                          data: {
                              members: newMembers,
                              leaderId: isLeader ? '' : otherSquad.leaderId
                          }
                      });
                  }
                  replacementsToAdd.push(item.characterId);
              }

              if (existing) {
                  participantsToUpdate.push({
                      id: existing.id,
                      data: {
                          attendance: item.attended,
                          isReplacement: item.isReplacement ?? existing.isReplacement,
                          status: item.attended ? (existing.status === 'NOT_GOING' ? 'GOING' : existing.status) : 'NOT_GOING',
                      }
                  });
              } else if (item.isReplacement) {
                  participantsToCreate.push({
                      eventId,
                      characterId: item.characterId,
                      status: item.attended ? 'GOING' : 'NOT_GOING', 
                      attendance: item.attended,
                      isReplacement: true,
                  });
              }
          }

          // Bulk update existing participants
          if (participantsToUpdate.length > 0) {
              await Promise.all(participantsToUpdate.map(p => 
                  tx.eventParticipant.update({
                      where: { id: p.id },
                      data: p.data
                  })
              ));
          }

          // Bulk create new participants
          if (participantsToCreate.length > 0) {
              await tx.eventParticipant.createMany({
                  data: participantsToCreate,
                  skipDuplicates: true
              });
          }

          // 2. Mark squad(s) as submitted and add replacements to squads
          if (dto.squadId === 'ALL') {
              await tx.squad.updateMany({
                  where: { eventId },
                  data: { feedbackSubmitted: true },
              });

              if (replacementsToAdd.length > 0) {
                  let donaborSquad = event.squads.find(s => s.name === 'Донабор');
                  if (donaborSquad) {
                      const newMembers = [...new Set([...donaborSquad.members, ...replacementsToAdd])];
                      await tx.squad.update({
                          where: { id: donaborSquad.id },
                          data: { members: newMembers }
                      });
                  } else {
                      await tx.squad.create({
                          data: {
                              name: 'Донабор',
                              eventId,
                              leaderId: '',
                              members: replacementsToAdd,
                              feedbackSubmitted: true
                          }
                      });
                  }
              }
          } else {
              const squad = event.squads.find(s => s.id === dto.squadId);
              if (squad && replacementsToAdd.length > 0) {
                  const newMembers = [...new Set([...squad.members, ...replacementsToAdd])];
                  await tx.squad.update({
                      where: { id: dto.squadId },
                      data: { 
                          feedbackSubmitted: true,
                          members: newMembers
                      },
                  });
              } else {
                  await tx.squad.update({
                      where: { id: dto.squadId },
                      data: { feedbackSubmitted: true },
                  });
              }
          }

          // 3. Check if all squads are submitted and update event status
          const allSquads = await tx.squad.findMany({ where: { eventId } });
          const allSubmitted = allSquads.every((s) => s.feedbackSubmitted);

          if (allSubmitted || dto.squadId === 'ALL') {
              await tx.event.update({
                  where: { id: eventId },
                  data: {
                      feedbackSubmitted: true,
                      status: 'COMPLETED',
                  },
              });

              // 4. Mark all unassigned clan members as NOT_GOING
              const squadsWithMembers = await tx.squad.findMany({ where: { eventId } });
              const assignedCharIds = new Set<string>();
              squadsWithMembers.forEach(s => s.members.forEach(m => assignedCharIds.add(m)));

              const clanMembers = await tx.character.findMany({
                  where: {
                      clanId: event.clanWeeklyContext.clanId,
                      id: { notIn: Array.from(assignedCharIds) },
                      OR: [
                          { clanJoinDate: null },
                          { clanJoinDate: { lte: event.date } }
                      ]
                  },
                  select: { id: true }
              });

              if (clanMembers.length > 0) {
                  const unassignedData = clanMembers.map(member => ({
                      eventId,
                      characterId: member.id,
                      status: 'NOT_GOING',
                      attendance: false,
                      isReplacement: false
                  }));

                  await tx.eventParticipant.createMany({
                      data: unassignedData,
                      skipDuplicates: true
                  });

                  await tx.eventParticipant.updateMany({
                      where: {
                          eventId,
                          characterId: { in: clanMembers.map(m => m.id) }
                      },
                      data: {
                          status: 'NOT_GOING',
                          attendance: false
                      }
                  });
              }
          }

          await this.audit.log(event.clanWeeklyContext.clanId, actor.id, 'EVENT_FEEDBACK', event.name, {
              squadId: dto.squadId,
              attendanceCount: dto.attendanceData.length,
          });

          return tx.squad.findMany({ where: { eventId } });
      });

      if (gateway) {
          // Run in background to avoid blocking the response
          gateway.server.to(`event_${eventId}`).emit('squadsUpdated', result);
      }

      return { success: true };
  }

    async delete(id: string, actor: any) {
        const event = await this.prisma.event.findUnique({
            where: { id },
            include: { 
                clanWeeklyContext: { include: { clan: true } },
                participants: {
                    include: {
                        character: { include: { user: true } }
                    }
                }
            }
        });

        if (!event) throw new NotFoundException('Event not found');
        if (event.clanWeeklyContext.clanId !== actor.clanId) {
            throw new ForbiddenException('Access denied');
        }

        // Delete Telegram messages
        for (const participant of event.participants) {
            // Delete creation notification
            if (participant.character.user.telegramId && participant.telegramMessageId) {
                await this.telegram.deleteMessage(
                    participant.character.user.telegramId,
                    parseInt(participant.telegramMessageId)
                );
            }
            // Delete rally notification
            if (participant.character.user.telegramId && participant.telegramRallyMessageId) {
                await this.telegram.deleteMessage(
                    participant.character.user.telegramId,
                    parseInt(participant.telegramRallyMessageId)
                );
            }
        }

        // Delete Group Messages
        if (event.clanWeeklyContext.clan.telegramGroupId) {
            if (event.telegramGroupMessageId) {
                await this.telegram.deleteMessage(
                    event.clanWeeklyContext.clan.telegramGroupId,
                    parseInt(event.telegramGroupMessageId)
                );
            }
            if (event.telegramRallyGroupMessageId) {
                await this.telegram.deleteMessage(
                    event.clanWeeklyContext.clan.telegramGroupId,
                    parseInt(event.telegramRallyGroupMessageId)
                );
            }
        }

        await this.prisma.$transaction([
            this.prisma.eventParticipant.deleteMany({ where: { eventId: id } }),
            this.prisma.squad.deleteMany({ where: { eventId: id } }),
            this.prisma.event.delete({ where: { id } })
        ]);

        await this.audit.log(actor.clanId, actor.id, 'DELETE_EVENT', event.name);
      
        return { success: true };
    }
  }
