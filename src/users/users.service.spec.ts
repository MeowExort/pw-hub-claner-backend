import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCharacterDto } from './dto/create-character.dto';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    const prismaMock = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      character: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      clanWeeklyContext: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCharacter', () => {
      it('should add character to user', async () => {
          const userId = 'user1';
          const dto: CreateCharacterDto = { name: 'Hero', class: 'Archer', server: 'Server1', pwobsLink: 'http://link' };
          
          prisma.character.create.mockResolvedValue({ id: 'char1', ...dto });
          // prisma.user.update.mockResolvedValue({ id: userId, mainCharacterId: 'char1' });
          // prisma.user.findUnique.mockResolvedValue({ id: userId, mainCharacterId: null });

          const result = await service.createCharacter(userId, dto);
          expect(result).toBeDefined();
          expect(prisma.character.create).toHaveBeenCalled();
          // expect(prisma.user.update).toHaveBeenCalled();
      });
  });

  describe('getMyActivity', () => {
      it('should return aggregated activity', async () => {
          const userId = 'user1';
          const weekIso = '2025-W01';
          
          prisma.user.findUnique.mockResolvedValue({ id: userId, mainCharacterId: 'char1' });
          prisma.character.findUnique.mockResolvedValue({ id: 'char1', clanId: 'clan1', clan: { id: 'clan1' } });
          
          prisma.clanWeeklyContext.findUnique.mockResolvedValue({
              id: 'ctx1',
              events: [
                  { 
                      id: 'evt1', 
                      name: 'Event1', 
                      participants: [{ characterId: 'char1', status: 'ACCEPTED' }] 
                  }
              ],
              clanHall: {
                  progress: [{ characterId: 'char1', stage: 1, valor: 10, gold: 50, createdAt: new Date() }]
              },
              rhythmRecords: [{ characterId: 'char1', valor: 2 }],
              forbiddenKnowledgeRecords: [{ characterId: 'char1', valor: 7, circles: 1 }]
          });

          const result = await service.getMyActivity(userId, weekIso);
          expect(result).toBeDefined();
          expect(result.events).toHaveLength(1);
          expect(result.summary.totalValor).toBe(19); // 10 + 2 + 7
      });
  });
});
