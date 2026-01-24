import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClanDto } from './dto/create-clan.dto';
import { CreateApplicationDto, UpdateApplicationDto, ApplicationDecision } from './dto/clan-application.dto';
import { UpdateClanSettingsDto, UpdateRolePermissionsDto, AddCustomEventTemplateDto } from './dto/update-settings.dto';
import { AuditService } from '../audit/audit.service';
import { randomUUID } from 'crypto';
import { TelegramService } from '../telegram/telegram.service';
import { Markup } from 'telegraf';


@Injectable()
export class ClansService {
  constructor(
      private prisma: PrismaService,
      private audit: AuditService,
      private telegram: TelegramService
  ) {}

  async findAll() {
    return this.prisma.clan.findMany({
        include: { members: true, applications: true }
    });
  }

  async create(userId: string, dto: CreateClanDto) {
    const user = await this.prisma.user.findUnique({ 
        where: { id: userId },
        include: { characters: true } 
    });
    if (!user || !user.mainCharacterId) throw new BadRequestException('No character selected');
    
    const character = user.characters.find(c => c.id === user.mainCharacterId);
    if (character.clanId) throw new BadRequestException('Character already in a clan');

    const defaultSettings = {
      rolePermissions: [
          { role: 'MASTER', permissions: ['ALL'] },
          { role: 'MARSHAL', permissions: ['EVENT_MANAGE', 'MEMBER_INVITE', 'CAN_UPLOAD_REPORTS', 'MANUAL_PVE_EDIT'] },
          { role: 'OFFICER', permissions: ['EVENT_MANAGE', 'CAN_UPLOAD_REPORTS', 'MANUAL_PVE_EDIT'] },
          { role: 'PL', permissions: ['SQUAD_MANAGE'] },
          { role: 'MEMBER', permissions: [] }
      ],
      customEvents: [],
      pvpDefaultRallyOffsetMinutes: 30,
      obligations: {
          rhythmRequired: true,
          forbiddenKnowledge: { required: true, badFrom: 0, normalFrom: 1, goodFrom: 3 },
          clanHall: { required: true, requiredStagesSameDay: [] }
      }
    };

    // Transaction: create clan and update character
    return this.prisma.$transaction(async (tx) => {
        const clan = await tx.clan.create({
            data: {
                name: dto.name,
                icon: dto.icon,
                description: dto.description,
                server: character.server,
                settings: defaultSettings,
            }
        });
        
        // Update character role
        await tx.character.update({
            where: { id: character.id },
            data: {
                clanId: clan.id,
                clanRole: 'MASTER',
                clanJoinDate: new Date()
            }
        });
        
        return clan;
    });
  }

  async findOne(id: string) {
    const clan = await this.prisma.clan.findUnique({ where: { id }, include: { members: true, applications: true } });
    if (!clan) throw new NotFoundException('Clan not found');
    return clan;
  }

  async getRoster(id: string) {
    const clan = await this.prisma.clan.findUnique({ 
        where: { id }, 
        include: { members: true } 
    });
    if (!clan) throw new NotFoundException('Clan not found');

    const stats = await this.calculateRosterStats(id, clan.members, clan.settings);
    
    // Map members to include role and stats
    return clan.members.map(m => ({
        ...m,
        id: m.id,
        name: m.name,
        class: m.class,
        role: m.clanRole,
        joinDate: m.clanJoinDate,
        attendanceRate: stats[m.id]?.attendanceRate ?? 100,
        pveActivity: stats[m.id]?.pveActivity ?? null,
        activityDetails: stats[m.id]?.activityDetails
    }));
  }

  private async calculateRosterStats(clanId: string, members: any[], settings: any) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const stats: Record<string, { attendanceRate: number; pveActivity: number | null, activityDetails?: any }> = {};

    // 1. Get all past events for attendanceRate (filtered by start of month)
    const monthEvents = await this.prisma.event.findMany({
        where: {
            clanWeeklyContext: { clanId },
            date: { lt: now, gte: startOfMonth }
        },
        include: { participants: true },
        orderBy: { date: 'asc' }
    });

    const characterIds = members.map(m => m.id);

    // 2. Get current week data for pveActivity
    const d = new Date();
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
    const currentWeekIso = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

    const weekContext = await this.prisma.clanWeeklyContext.findUnique({
        where: { clanId_weekIso: { clanId, weekIso: currentWeekIso } },
        include: {
            rhythmRecords: { where: { characterId: { in: characterIds } } },
            forbiddenKnowledgeRecords: { where: { characterId: { in: characterIds } } },
            clanHall: { 
                include: { 
                    progress: true
                } 
            }
        }
    });

    const obligations = settings?.obligations;

    // Pre-calculate full stage close times if needed
    const fullStageCloses = new Map<number, Date>();
    if (obligations?.clanHall?.required && weekContext?.clanHall) {
        const allKhProgress = weekContext.clanHall.progress;
        for (let i = 1; i <= 6; i++) {
            let times: number[] = [];
            const stageRecords = allKhProgress
                .filter(p => p.stage === i)
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            if (stageRecords.length >= 120) {
                times.push(stageRecords[119].createdAt.getTime());
            }
            const nextStageRecords = allKhProgress
                .filter(p => p.stage > i)
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            if (nextStageRecords.length > 0) {
                if (stageRecords.length > 0 && stageRecords.length < 120) {
                    const tempKhStages = stageRecords.filter( p => p.createdAt.getTime() < nextStageRecords[0].createdAt.getTime());
                    if (tempKhStages.length > 0) {
                        times.push(tempKhStages[tempKhStages.length - 1].createdAt.getTime());
                    } else {
                        times.push(nextStageRecords[0].createdAt.getTime());
                    }
                } else {
                    times.push(nextStageRecords[0].createdAt.getTime());
                }
            }
            if (times.length > 0) {
                fullStageCloses.set(i, new Date(Math.min(...times)));
            }
        }
    }

    for (const member of members) {
        // Attendance Rate
        const memberEvents = monthEvents.filter(e => e.date >= member.clanJoinDate);
        const attendanceDetails: any[] = [];
        
        memberEvents.forEach(e => {
            const p = e.participants.find(p => p.characterId === member.id);
            let attended = false;
            if (e.feedbackSubmitted) {
                attended = p?.attendance === true;
            } else {
                attended = p?.status === 'GOING';
            }
            attendanceDetails.push({
                eventName: e.name,
                date: e.date,
                attended
            });
        });

        if (memberEvents.length === 0) {
            stats[member.id] = { attendanceRate: 100, pveActivity: null, activityDetails: { attendance: [], pve: null } };
        } else {
            const attendedCount = attendanceDetails.filter(a => a.attended).length;
            
            stats[member.id] = {
                attendanceRate: (attendedCount / memberEvents.length) * 100,
                pveActivity: null,
                activityDetails: {
                    attendance: attendanceDetails,
                    pve: null
                }
            };
        }

        // PVE Activity
        if (obligations && weekContext) {
            const pveMetrics: number[] = [];
            const pveDetails: any = {
                kh: [],
                rhythm: null,
                zu: null
            };
            
            // KH
            if (obligations.clanHall?.required) {
                const memberKh = (weekContext.clanHall?.progress.filter(p => p.characterId === member.id) || [])
                    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                const requiredStages = obligations.clanHall.requiredStagesSameDay || [];
                
                if (requiredStages.length > 0) {
                    let mandatoryAttended = 0;
                    
                    requiredStages.forEach((stage: number) => {
                        const attendance = memberKh.find(p => p.stage === stage);
                        let success = false;
                        if (attendance) {
                            const attendanceTime = attendance.createdAt.getTime();
                            let activeStageAtTime = 1;
                            for (let s = 1; s <= 6; s++) {
                                const prevStageClose = fullStageCloses.get(s);
                                if (prevStageClose && prevStageClose.getTime() < attendanceTime) {
                                    activeStageAtTime = s + 1;
                                }
                            }
                            if (stage === activeStageAtTime) {
                                mandatoryAttended++;
                                success = true;
                            }
                        }
                        pveDetails.kh.push({ stage, attended: success });
                    });
                    pveMetrics.push(Math.min(100, (mandatoryAttended / requiredStages.length) * 100));
                } else {
                    pveMetrics.push(memberKh.length > 0 ? 100 : 0);
                    pveDetails.kh.push({ stage: 'Any', attended: memberKh.length > 0 });
                }
            }

            // Rhythm
            if (obligations.rhythmRequired) {
                const record = weekContext.rhythmRecords.find(r => r.characterId === member.id);
                const valor = record?.valor || 0;
                const attended = Math.min(100, (valor / 14) * 100);
                pveMetrics.push(attended);
                pveDetails.rhythm = {
                    valor,
                    attended,
                    levels: {
                        basic: valor >= 2,
                        medium: valor >= 6,
                        full: valor >= 14
                    }
                };
            }

            // Forbidden Knowledge
            if (obligations.forbiddenKnowledge?.required) {
                const record = weekContext.forbiddenKnowledgeRecords.find(r => r.characterId === member.id);
                const good = obligations.forbiddenKnowledge.goodFrom || 3;
                const circles = record ? record.valor / 7 : 0;
                pveMetrics.push(Math.min(100, (circles / good) * 100));
                pveDetails.zu = { circles, required: good };
            }

            if (pveMetrics.length > 0) {
                stats[member.id].pveActivity = Math.min(100, pveMetrics.reduce((a, b) => a + b, 0) / pveMetrics.length);
                stats[member.id].activityDetails.pve = pveDetails;
            }
        }
    }

    return stats;
  }

  async leave(userId: string, clanId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mainCharacterId) throw new BadRequestException('No character selected');

    const member = await this.prisma.character.findUnique({ where: { id: user.mainCharacterId } });
    if (!member || member.clanId !== clanId) throw new BadRequestException('Not in this clan');

    await this.prisma.character.update({
        where: { id: member.id },
        data: { clanId: null, clanRole: null, clanJoinDate: null }
    });
  }

  async getApplications(id: string) {
      return this.prisma.clanApplication.findMany({ 
          where: { clanId: id },
          include: { votes: true, character: true }
      });
  }

  async apply(userId: string, clanId: string, dto: CreateApplicationDto) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { characters: true } });
      const charId = user.mainCharacterId;
      if (!charId) throw new BadRequestException('No character selected');
      
      const character = user.characters.find(c => c.id === charId);
      if (character.clanId) throw new BadRequestException('Already in a clan');
      
      const existing = await this.prisma.clanApplication.findFirst({
          where: { clanId, characterId: charId, status: 'PENDING' }
      });
      if (existing) throw new BadRequestException('Already applied');

      const app = await this.prisma.clanApplication.create({
          data: {
              clanId,
              characterId: charId,
              message: dto.message,
              status: 'PENDING'
          },
          include: {
              character: true,
              clan: true
          }
      });

      // Notify officers
      await this.notifyOfficersAboutApplication(app);
  }

  private async notifyOfficersAboutApplication(app: any) {
    const officers = await this.prisma.character.findMany({
        where: {
            clanId: app.clanId,
            clanRole: { in: ['MASTER', 'MARSHAL', 'OFFICER'] } // Simplified check, should ideally check permissions
        },
        include: { user: { include: { notificationSettings: true } } }
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://claner.pw-hub.ru';
    const characterLink = `\n<a href="${baseUrl}/c/${app.character.shortId || app.character.id}">Профиль персонажа</a>`;
    const messageText = app.message ? app.message : '<i>(без сообщения)</i>';
    const message = `<b>Новая заявка в клан ${app.clan.name}</b>\nОт: <code>${app.character.name}</code> (${app.character.class})${characterLink}\nСообщение: ${messageText}`;

    for (const officer of officers) {
        if (officer.user.telegramId && officer.user.notificationSettings?.clanApplications) {
            await this.telegram.sendMessage(officer.user.telegramId, message);
        }
    }

    // Notify Group
    if (app.clan.telegramGroupId) {
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('👍 0', `app_vote:${app.id}:like`),
                Markup.button.callback('👎 0', `app_vote:${app.id}:dislike`)
            ]
        ]);
        const groupMessage = await this.telegram.sendMessage(app.clan.telegramGroupId, message, {
            ...keyboard,
            message_thread_id: app.clan.telegramThreadId
        });
        
        if (groupMessage && !app.clan.telegramThreadId) {
            await this.telegram.pinMessage(app.clan.telegramGroupId, groupMessage.message_id);
        }
    }
  }

  async processApplication(userId: string, clanId: string, appId: string, dto: UpdateApplicationDto) {
     await this.checkPermission(userId, clanId, 'MEMBER_INVITE');
     
     const app = await this.prisma.clanApplication.findUnique({ 
         where: { id: appId },
         include: { character: { include: { user: { include: { notificationSettings: true } } } }, clan: true }
     });
     if (!app) throw new NotFoundException('Application not found');
     
     if (app.status !== 'PENDING') {
         throw new BadRequestException('Application is already processed');
     }

     if (dto.decision === ApplicationDecision.REJECT) {
         await this.prisma.clanApplication.update({ where: { id: appId }, data: { status: 'REJECTED' } });
         await this.audit.log(clanId, await this.getActorId(userId), 'REJECT_APPLICATION', `App ${appId}`);
         
         if (app.character.user.telegramId && app.character.user.notificationSettings?.applicationDecision) {
             await this.telegram.sendMessage(app.character.user.telegramId, `Ваша заявка в клан ${app.clan.name} была отклонена.`);
         }
     } else {
         await this.prisma.$transaction([
             this.prisma.clanApplication.update({ where: { id: appId }, data: { status: 'APPROVED' } }),
             this.prisma.character.update({
                 where: { id: app.characterId },
                 data: {
                     clanId,
                     clanRole: 'MEMBER',
                     clanJoinDate: new Date()
                 }
             })
         ]);
         await this.audit.log(clanId, await this.getActorId(userId), 'APPROVE_APPLICATION', `App ${appId}`);

         if (app.character.user.telegramId && app.character.user.notificationSettings?.applicationDecision) {
             await this.telegram.sendMessage(app.character.user.telegramId, `Поздравляем! Ваша заявка в клан ${app.clan.name} была принята!`);
         }
     }
  }

  async updateSettings(userId: string, clanId: string, dto: UpdateClanSettingsDto) {
      await this.checkPermission(userId, clanId, 'ALL'); 
      
      const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
      const currentSettings = clan.settings as any;
      
      const { telegramGroupId, telegramThreadId, ...settingsDto } = dto;

      const newSettings = {
          ...currentSettings,
          ...settingsDto,
          obligations: {
              ...(currentSettings.obligations || {}),
              ...(settingsDto.obligations || {})
          }
      };
      
      if (settingsDto.obligations?.forbiddenKnowledge) {
          newSettings.obligations.forbiddenKnowledge = {
              ...currentSettings.obligations.forbiddenKnowledge,
              ...settingsDto.obligations.forbiddenKnowledge
          };
      }
      if (settingsDto.obligations?.clanHall) {
          newSettings.obligations.clanHall = {
              ...currentSettings.obligations.clanHall,
              ...settingsDto.obligations.clanHall
          };
      }

      // Remove telegram fields from settings if they somehow got there
      delete (newSettings as any).telegramGroupId;
      delete (newSettings as any).telegramThreadId;

      const changes: any = {};
      try {
          // Flatten comparison for top-level keys
          const keys = new Set([...Object.keys(currentSettings), ...Object.keys(newSettings)]);
          for (const key of keys) {
              
              const v1 = currentSettings[key];
              const v2 = newSettings[key];
              
              if (JSON.stringify(v1) !== JSON.stringify(v2)) {
                  changes[key] = { from: v1, to: v2 };
              }
          }
      } catch (e) {
          console.error('Failed to calc diff', e);
      }

      const updated = await this.prisma.clan.update({
          where: { id: clanId },
          data: { 
              settings: newSettings,
              telegramGroupId,
              telegramThreadId
          }
      });
      await this.audit.log(clanId, await this.getActorId(userId), 'UPDATE_SETTINGS', 'Settings', changes);
      return updated;
  }
  
  async updateRolePermissions(userId: string, clanId: string, dto: UpdateRolePermissionsDto) {
      await this.checkPermission(userId, clanId, 'ALL');
      const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
      const settings = clan.settings as any;
      const rolePerms = settings.rolePermissions as any[];
      
      const idx = rolePerms.findIndex(r => r.role === dto.role);
      if (idx >= 0) {
          rolePerms[idx].permissions = dto.permissions;
      } else {
          rolePerms.push({ role: dto.role, permissions: dto.permissions });
      }
      
      settings.rolePermissions = rolePerms;
      await this.prisma.clan.update({ where: { id: clanId }, data: { settings } });
      await this.audit.log(clanId, await this.getActorId(userId), 'UPDATE_PERMISSIONS', dto.role);
      return rolePerms;
  }

  async addCustomEventTemplate(userId: string, clanId: string, dto: AddCustomEventTemplateDto) {
      await this.checkPermission(userId, clanId, 'EVENT_MANAGE');
      const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
      const settings = clan.settings as any;
      const templates = (settings.customEvents || []) as any[];
      
      const newTemplate = { id: `tpl_${Date.now()}`, ...dto };
      templates.push(newTemplate);
      settings.customEvents = templates;
      
      await this.prisma.clan.update({ where: { id: clanId }, data: { settings } });
      await this.audit.log(clanId, await this.getActorId(userId), 'ADD_TEMPLATE', newTemplate.name);
      return newTemplate;
  }

  async getClanHallProgress(clanId: string, weekIso: string) {
     const context = await this.prisma.clanWeeklyContext.findUnique({
         where: { clanId_weekIso: { clanId, weekIso } },
         include: { clanHall: { include: { progress: true } } }
     });
     return context?.clanHall || null;
  }

  async markClanHallAttendance(userId: string, clanId: string, characterId: string, stage: number, valor: number, gold: number) {
      // Find current week context
      const now = new Date();
      // ... simplified ISO week calculation (should match tasks.service)
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const isoYear = d.getUTCFullYear();
      const isoWeek = Math.ceil((((d.getTime() - (new Date(Date.UTC(isoYear, 0, 1))).getTime()) / 86400000) + 1) / 7);
      const weekIso = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;

      const context = await this.prisma.clanWeeklyContext.findUnique({
          where: { clanId_weekIso: { clanId, weekIso } },
          include: { clanHall: true }
      });

      if (!context || !context.clanHall) throw new BadRequestException('Weekly context or Clan Hall not found');

      const progress = await this.prisma.clanHallProgress.create({
          data: {
              clanHallId: context.clanHall.id,
              characterId,
              stage,
              valor,
              gold
          },
          include: {
              character: { include: { user: { include: { notificationSettings: true } } } },
              clanHall: { include: { clanWeeklyContext: { include: { clan: true } } } }
          }
      });

      // Notify character
      if (progress.character.user.telegramId && progress.character.user.notificationSettings?.attendanceMarking) {
          const clanName = progress.clanHall.clanWeeklyContext.clan.name;
          await this.telegram.sendMessage(
              progress.character.user.telegramId,
              `Вам проставлено посещение этапа КХ в клане <b>${clanName}</b>.\nПерсонаж: <code>${progress.character.name}</code>\nЭтап: ${stage}\nДоблесть: ${valor}\nЗолото: ${gold}`
          );
      }

      return progress;
  }
  

  async changeMemberRole(userId: string, clanId: string, memberId: string, newRole: string) {
    const ROLE_HIERARCHY: Record<string, number> = {
      MASTER: 4,
      MARSHAL: 3,
      OFFICER: 2,
      PL: 1,
      MEMBER: 0
    };

    if (!ROLE_HIERARCHY.hasOwnProperty(newRole)) {
        throw new BadRequestException('Invalid role');
    }

    await this.checkPermission(userId, clanId, 'MANAGE_ROLES');
    
    const actorId = await this.getActorId(userId);
    if (!actorId) throw new ForbiddenException('No character');

    const actor = await this.prisma.character.findUnique({ where: { id: actorId } });
    if (actor.clanId !== clanId) throw new ForbiddenException('Actor not in clan');

    const target = await this.prisma.character.findUnique({ where: { id: memberId } });
    if (!target || target.clanId !== clanId) throw new NotFoundException('Member not found');

    const actorLevel = ROLE_HIERARCHY[actor.clanRole] || 0;
    const targetLevel = ROLE_HIERARCHY[target.clanRole] || 0;
    const newLevel = ROLE_HIERARCHY[newRole];

    // Cannot change role of someone with higher or equal rank
    if (targetLevel >= actorLevel) {
        throw new ForbiddenException('Cannot modify role of member with equal or higher rank');
    }

    // Cannot promote to a rank higher than or equal to own
    if (newLevel >= actorLevel) {
        throw new ForbiddenException('Cannot promote to a rank higher than or equal to your own');
    }

    return this.prisma.character.update({
        where: { id: memberId },
        data: { clanRole: newRole }
    });
  }

  async kickMember(userId: string, clanId: string, memberId: string) {
    const ROLE_HIERARCHY: Record<string, number> = {
      MASTER: 4,
      MARSHAL: 3,
      OFFICER: 2,
      PL: 1,
      MEMBER: 0
    };

    await this.checkPermission(userId, clanId, 'CAN_KICK_MEMBERS');

    const actorId = await this.getActorId(userId);
    if (!actorId) throw new ForbiddenException('No character');

    const actor = await this.prisma.character.findUnique({ where: { id: actorId } });
    if (actor.clanId !== clanId) throw new ForbiddenException('Actor not in clan');

    const target = await this.prisma.character.findUnique({ where: { id: memberId } });
    if (!target || target.clanId !== clanId) throw new NotFoundException('Member not found');

    const actorLevel = ROLE_HIERARCHY[actor.clanRole] || 0;
    const targetLevel = ROLE_HIERARCHY[target.clanRole] || 0;

    // Cannot kick someone with higher or equal rank
    if (targetLevel >= actorLevel) {
        throw new ForbiddenException('Cannot kick member with equal or higher rank');
    }

    return this.prisma.character.update({
        where: { id: memberId },
        data: { clanId: null, clanRole: null }
    });
  }

  private async checkPermission(userId: string, clanId: string, requiredPerm: string) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user.mainCharacterId) throw new ForbiddenException('No character');
      const member = await this.prisma.character.findUnique({ where: { id: user.mainCharacterId } });
      
      if (member.clanId !== clanId) throw new ForbiddenException('Not a member');
      
      const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
      const settings = clan.settings as any;
      const rolePerms = settings.rolePermissions.find(rp => rp.role === member.clanRole);
      
      if (!rolePerms) throw new ForbiddenException('Role not found');
      if (rolePerms.permissions.includes('ALL')) return;
      if (!rolePerms.permissions.includes(requiredPerm)) throw new ForbiddenException('Permission denied');
  }

  private async getActorId(userId: string): Promise<string | null> {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      return user?.mainCharacterId || null;
  }
}
