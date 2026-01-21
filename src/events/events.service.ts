import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { RsvpDto } from './dto/rsvp.dto';
import { SquadDto } from './dto/squad.dto';
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
    
    return this.prisma.event.findMany({
        where: {
            clanWeeklyContext: {
                clanId: actor.clanId
            },
            date: options.history ? { lt: new Date() } : { gte: new Date() }
        },
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

      // Notify members
      await this.notifyMembersAboutEvent(event);

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

    for (const member of members) {
        if (member.user.telegramId && member.user.notificationSettings?.pvpEventCreated) {
            const personalMessage = baseMessage + `\n\nПерсонаж: <code>${member.name}</code>`;
            const memberKeyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Иду', `event_rsvp:${event.id}:${member.shortId || member.id}:GOING`),
                    Markup.button.callback('❌ Не пойду', `event_rsvp:${event.id}:${member.shortId || member.id}:NOT_GOING`)
                ]
            ]);
            const sent = await this.telegram.sendMessage(member.user.telegramId, personalMessage, memberKeyboard);
            if (sent) {
                await this.prisma.eventParticipant.upsert({
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
                });
            }
        }
    }

    // Notify Group
    if (clan.telegramGroupId) {
        const groupKeyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Иду 0', `event_rsvp:${event.id}:GOING`),
                Markup.button.callback('❌ Не пойду 0', `event_rsvp:${event.id}:NOT_GOING`)
            ]
        ]);
        const groupMessage = await this.telegram.sendMessage(clan.telegramGroupId, baseMessage, {
            ...groupKeyboard,
            message_thread_id: clan.telegramThreadId
        });
        if (groupMessage) {
            await this.prisma.event.update({
                where: { id: event.id },
                data: { telegramGroupMessageId: groupMessage.message_id.toString() }
            });
            if (!clan.telegramThreadId) {
                await this.telegram.pinMessage(clan.telegramGroupId, groupMessage.message_id);
            }
        }
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
          include: { clanWeeklyContext: { include: { clan: true } } }
      });
      if (!event) throw new NotFoundException('Event not found');

      const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { characters: true } });
      const charId = user?.mainCharacterId;
      if (!charId) throw new BadRequestException('No character');
      
      const character = user.characters.find(c => c.id === charId);
      if (character.clanId !== event.clanWeeklyContext.clanId) throw new ForbiddenException('Not in clan');
      
      await this.prisma.eventParticipant.upsert({
          where: {
              eventId_characterId: {
                  eventId,
                  characterId: charId
              }
          },
          create: {
              eventId,
              characterId: charId,
              status: dto.status
          },
          update: {
              status: dto.status
          }
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
          include: { clanWeeklyContext: true }
      });
      if (!event) throw new NotFoundException('Event not found');
      if (event.clanWeeklyContext.clanId !== actor.clanId) throw new ForbiddenException('Access denied');

      // Replace existing squads with the provided list using proper nested writes
      const updated = await this.prisma.event.update({
          where: { id: eventId },
          data: {
              squads: {
                  // Remove all existing squads of this event
                  deleteMany: {},
                  // Create new squads from DTO
                  create: squads.map(sq => ({
                      name: sq.name || 'Unnamed Squad',
                      leaderId: sq.leaderId || '',
                      members: sq.members ?? []
                  }))
              }
          },
          include: {
              squads: true,
              clanWeeklyContext: { include: { clan: true } }
          }
      });
  
      await this.audit.log(actor.clanId, actor.id, 'UPDATE_SQUADS', event.name);

      // Notify users about squad assignment
      await this.notifyMembersAboutSquads(updated);

      return updated;
  }

  private async notifyMembersAboutSquads(event: any) {
      const membersToNotify = new Map<string, { squadName: string, leaderName: string, squad: any }>();

      for (const squad of event.squads) {
          let leaderName = 'Не указан';
          if (squad.leaderId) {
              const leader = await this.prisma.character.findUnique({ where: { id: squad.leaderId } });
              leaderName = leader?.name || 'Не указан';
          }

          for (const charId of squad.members) {
              membersToNotify.set(charId, { squadName: squad.name, leaderName, squad });
          }
      }

      for (const [charId, info] of membersToNotify.entries()) {
          const participant = await this.prisma.eventParticipant.findUnique({
              where: {
                  eventId_characterId: {
                      eventId: event.id,
                      characterId: charId
                  }
              },
              include: {
                  character: { include: { user: { include: { notificationSettings: true } } } }
              }
          });

          if (participant?.character?.user?.telegramId && participant.telegramMessageId) {
              const dateStr = new Date(event.date).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
              const rallyStr = event.rallyTime ? new Date(event.rallyTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : 'не указано';
              
              let message = `<b>Новое событие: ${event.name}</b>\nТип: ${event.type}\nДата: ${dateStr}\nСбор: ${rallyStr}\n${event.description ? `\n${event.description}` : ''}`;
              
              message += `\n\nПерсонаж: <code>${participant.character.name}</code>`;

              const statusText = participant.status === 'GOING' ? 'Вы идете ✅' : (participant.status === 'NOT_GOING' ? 'Вы не идете ❌' : '');
              if (statusText) {
                  message += `\n\nСтатус: <b>${statusText}</b>`;
              }

              message += `\n\nВас расписали в отряд!\nОтряд: <b>${info.squadName}</b>\nПЛ: <code>${info.leaderName}</code>`;

              // Generate copy string for PL
              let copyExtra = '';
              const squad = info.squad;
              const isPL = participant.characterId === squad.leaderId;
              if (isPL) {
                  const memberNames = [];
                  for (const mId of squad.members) {
                      if (mId === squad.leaderId) continue;
                      const mChar = await this.prisma.character.findUnique({ where: { id: mId } });
                      memberNames.push(mChar?.name || 'Unknown');
                  }
                  const copyString = `${squad.name}: ${memberNames.join(', ')}`;
                  copyExtra = `\n\n<b>Список для копирования:</b>\n<code>${copyString}</code>`;
              }

              const keyboard = Markup.inlineKeyboard([
                  [
                      Markup.button.callback('🔄 Изменить решение', `event_rsvp:${event.id}:${participant.character.shortId || charId}:${participant.status === 'GOING' ? 'NOT_GOING' : 'GOING'}`)
                  ]
              ]);

              await this.telegram.editMessage(participant.character.user.telegramId, parseInt(participant.telegramMessageId), message + copyExtra, keyboard);
          }
      }
  }
  
  async completeEvent(userId: string, eventId: string, reportUploaded: boolean) {
       const event = await this.prisma.event.findUnique({
          where: { id: eventId },
          include: { clanWeeklyContext: true }
      });
      if (!event) throw new NotFoundException('Event not found');
      
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const charId = user?.mainCharacterId;

      const updated = await this.prisma.event.update({
          where: { id: eventId },
          data: {
              status: reportUploaded ? 'COMPLETED' : 'ACTIVE'
          }
      });
      
      if (charId) {
          await this.audit.log(event.clanWeeklyContext.clanId, charId, 'COMPLETE_EVENT', event.name);
      }
      return updated;
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
