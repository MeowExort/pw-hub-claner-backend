import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClanDto } from './dto/create-clan.dto';
import { CreateApplicationDto, UpdateApplicationDto, ApplicationDecision } from './dto/clan-application.dto';
import { UpdateClanSettingsDto, UpdateRolePermissionsDto, AddCustomEventTemplateDto } from './dto/update-settings.dto';
import { AuditService } from '../audit/audit.service';
import { randomUUID } from 'crypto';


@Injectable()
export class ClansService {
  constructor(
      private prisma: PrismaService,
      private audit: AuditService
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
    
    // Map members to include role from Character fields
    return clan.members.map(m => ({
        ...m,
        role: m.clanRole,
        joinDate: m.clanJoinDate
    }));
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
      return this.prisma.clanApplication.findMany({ where: { clanId: id } });
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

      await this.prisma.clanApplication.create({
          data: {
              clanId,
              characterId: charId,
              message: dto.message,
              status: 'PENDING'
          }
      });
  }

  async processApplication(userId: string, clanId: string, appId: string, dto: UpdateApplicationDto) {
     await this.checkPermission(userId, clanId, 'MEMBER_INVITE');
     
     const app = await this.prisma.clanApplication.findUnique({ where: { id: appId } });
     if (!app) throw new NotFoundException('Application not found');
     
     if (app.status !== 'PENDING') {
         throw new BadRequestException('Application is already processed');
     }

     if (dto.decision === ApplicationDecision.REJECT) {
         await this.prisma.clanApplication.update({ where: { id: appId }, data: { status: 'REJECTED' } });
         await this.audit.log(clanId, await this.getActorId(userId), 'REJECT_APPLICATION', `App ${appId}`);
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
     }
  }

  async updateSettings(userId: string, clanId: string, dto: UpdateClanSettingsDto) {
      await this.checkPermission(userId, clanId, 'ALL'); 
      
      const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
      const currentSettings = clan.settings as any;
      
      const newSettings = {
          ...currentSettings,
          ...dto,
          obligations: {
              ...(currentSettings.obligations || {}),
              ...(dto.obligations || {})
          }
      };
      
      if (dto.obligations?.forbiddenKnowledge) {
          newSettings.obligations.forbiddenKnowledge = {
              ...currentSettings.obligations.forbiddenKnowledge,
              ...dto.obligations.forbiddenKnowledge
          };
      }
      if (dto.obligations?.clanHall) {
          newSettings.obligations.clanHall = {
              ...currentSettings.obligations.clanHall,
              ...dto.obligations.clanHall
          };
      }

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
          data: { settings: newSettings }
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

    // Cannot promote to a rank higher than own
    if (newLevel > actorLevel) {
        throw new ForbiddenException('Cannot promote to a rank higher than your own');
    }

    return this.prisma.character.update({
        where: { id: memberId },
        data: { clanRole: newRole }
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
