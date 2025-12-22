import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { RsvpDto } from './dto/rsvp.dto';
import { SquadDto } from './dto/squad.dto';
import { ClanPermission } from '../common/constants/permissions';
import { AuditService } from '../audit/audit.service';

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
      private audit: AuditService
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

  async findAll(actor: any) {
    if (!actor.clanId) return [];
    
    return this.prisma.event.findMany({
        where: {
            clanWeeklyContext: {
                clanId: actor.clanId
            },
            date: { gte: new Date() }
        },
        include: {
            participants: true,
            squads: true
        },
        orderBy: {
            date: 'desc'
        }
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
          }
      });
      
      await this.audit.log(actor.clanId, actor.id, 'CREATE_EVENT', event.name);
      return event;
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
          include: { clanWeeklyContext: true }
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
      
      return this.prisma.event.findUnique({ where: { id: eventId }, include: { participants: true } });
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
              squads: true
          }
      });
    
      await this.audit.log(actor.clanId, actor.id, 'UPDATE_SQUADS', event.name);
      return updated;
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
}
