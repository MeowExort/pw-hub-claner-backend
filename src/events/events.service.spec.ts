import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from './dto/create-event.dto';
import { RsvpStatus } from './dto/rsvp.dto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    const prismaMock = {
      user: { findUnique: jest.fn() },
      event: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      eventParticipant: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
      character: { findUnique: jest.fn() },
      clanWeeklyContext: { findUnique: jest.fn(), create: jest.fn() },
      clan: { findUnique: jest.fn() },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    const auditMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get<PrismaService>(PrismaService);
    audit = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
      it('should create an event', async () => {
          const userId = 'user1';
          const dto = { name: 'Raid', type: EventType.CUSTOM, date: '2025-01-01T20:00:00Z' };
          const actor = { id: 'char1', clanId: 'clan1', clanRole: 'OFFICER' };

          prisma.user.findUnique.mockResolvedValue({ mainCharacterId: 'char1' });
          prisma.character.findUnique.mockResolvedValue(actor);
          prisma.clan.findUnique.mockResolvedValue({ 
              id: 'clan1', 
              settings: { rolePermissions: [{ role: 'OFFICER', permissions: ['EVENT_MANAGE'] }] } 
          });

          // Week context mock
          prisma.clanWeeklyContext.findUnique.mockResolvedValue({ id: 'ctx1' });
          prisma.event.create.mockResolvedValue({ id: 'evt1', ...dto });

          const result = await service.create(dto, actor);
          expect(result).toBeDefined();
          expect(prisma.event.create).toHaveBeenCalled();
      });
  });

  describe('rsvp', () => {
      it('should update participation', async () => {
          const userId = 'user1';
          const eventId = 'evt1';
          const dto = { status: RsvpStatus.GOING, characterId: 'char1' };
          
          prisma.user.findUnique.mockResolvedValue({ 
              mainCharacterId: 'char1',
              characters: [{ id: 'char1', clanId: 'clan1' }] 
          });
          prisma.character.findUnique.mockResolvedValue({ id: 'char1', clanId: 'clan1' });
          prisma.event.findUnique.mockResolvedValue({ 
              id: eventId, 
              clanWeeklyContext: { clanId: 'clan1' } 
          });
          prisma.eventParticipant.findUnique.mockResolvedValue(null);
          prisma.eventParticipant.create.mockResolvedValue({ id: 'p1', status: 'ACCEPTED' });

          const result = await service.rsvp(userId, eventId, dto);
          expect(result).toBeDefined();
          expect(prisma.eventParticipant.create).toHaveBeenCalled();
      });
  });
});
