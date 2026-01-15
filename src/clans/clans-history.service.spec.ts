import { Test, TestingModule } from '@nestjs/testing';
import { ClansHistoryService } from './clans-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FactionHistoryParser, ParsedFactionRecord } from './faction-history.parser';

describe('ClansHistoryService', () => {
  let service: ClansHistoryService;
  let prisma: any;
  let audit: any;
  let parser: any;

  beforeEach(async () => {
    const prismaMock = {
      clan: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      character: { findMany: jest.fn(), update: jest.fn() },
      clanWeeklyContext: { findUnique: jest.fn(), create: jest.fn() },
      clanHall: { findUnique: jest.fn(), create: jest.fn() },
      rhythm: { upsert: jest.fn() },
      forbiddenKnowledge: { upsert: jest.fn() },
      clanHallProgress: { findMany: jest.fn(), upsert: jest.fn() },
      factionHistory: { findMany: jest.fn(), upsert: jest.fn() },
      $transaction: jest.fn((args) => {
          if (Array.isArray(args)) return Promise.resolve(args);
          return Promise.resolve(args(prismaMock));
      }),
    };

    const auditMock = {
      log: jest.fn(),
    };

    const parserMock = {
      parse: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClansHistoryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: FactionHistoryParser, useValue: parserMock },
      ],
    }).compile();

    service = module.get<ClansHistoryService>(ClansHistoryService);
    prisma = module.get<PrismaService>(PrismaService);
    audit = module.get<AuditService>(AuditService);
    parser = module.get<FactionHistoryParser>(FactionHistoryParser);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processHistoryTask', () => {
    it('should process records correctly', async () => {
        const taskId = 'task1';
        const userId = 'user1';
        const clanId = 'clan1';
        const fileBuffer = Buffer.from('data');

        // Setup task
        (service as any).uploadTasks.set(taskId, {
            id: taskId,
            status: 'PENDING',
            progress: 0,
            total: 0
        });

        // Mock parser
        const records: ParsedFactionRecord[] = [
            { id: 100, timestamp: 1234567890, who: 1, type: 1, params: [7, 0, 0], action: 'A', description: 'D', date: new Date('2025-01-01') },
            { id: 101, timestamp: 1234567891, who: 1, type: 1, params: [4, 20, 0], action: 'A', description: 'D', date: new Date('2025-01-01') },
            { id: 102, timestamp: 1234567891, who: 1, type: 2, params: [20, 0, 0], action: 'A', description: 'D', date: new Date('2025-01-01') },
        ];
        parser.parse.mockReturnValue(records);

        // Mock Prisma
        prisma.factionHistory.findMany.mockResolvedValue([]); // No existing records
        prisma.character.findMany.mockResolvedValue([{ id: 'char1', gameCharId: 1, clanId }]);
        prisma.user.findUnique.mockResolvedValue({ id: userId, mainCharacterId: 'char1' });
        
        // Mock Weekly Context
        prisma.clanWeeklyContext.findUnique.mockResolvedValue({ id: 'ctx1', clanHall: { id: 'ch1' }, dateStart: new Date('2024-12-30') });
        prisma.clanHall.findUnique.mockResolvedValue({ id: 'ch1' });
        prisma.clanHallProgress.findMany.mockResolvedValue([]);

        await service.processHistoryTask(taskId, userId, clanId, fileBuffer);

        const task = await service.getUploadTask(taskId);
        expect(task.status).toBe('COMPLETED');
        expect(task.total).toBe(3);
        expect(task.result.zuCirclesAdded).toBe(1);
        expect(task.result.khChecksAdded).toBe(1); 

        expect(prisma.factionHistory.upsert).toHaveBeenCalledTimes(3);
        expect(prisma.forbiddenKnowledge.upsert).toHaveBeenCalled();
        expect(prisma.clanHallProgress.upsert).toHaveBeenCalled();
    });
  });

  describe('getWeeklySummary', () => {
      it('should return summary stats', async () => {
          const clanId = 'clan1';
          const week = '2025-W01';
          
          prisma.clanWeeklyContext.findUnique.mockResolvedValue({
              id: 'ctx1',
              rhythmRecords: [{ characterId: 'char1', valor: 10 }],
              forbiddenKnowledgeRecords: [{ characterId: 'char1', valor: 7, circles: 1 }],
              clanHall: {
                  progress: [{ characterId: 'char1', stage: 1, valor: 4, gold: 20, createdAt: new Date() }]
              },
              events: []
          });

          prisma.clan.findUnique.mockResolvedValue({
              id: clanId,
              members: [
                  { id: 'char1', name: 'Char1', class: 'Archer' },
                  { id: 'char2', name: 'Char2', class: 'Priest' }
              ]
          });

          const result = await service.getWeeklySummary(clanId, week);
          
          expect(result).toHaveLength(2);
          const char1 = result.find(r => r.characterId === 'char1');
          expect(char1).toBeDefined();
          expect(char1.totalValor).toBe(21); // 10 (rhythm) + 7 (forbiddenKnowledge) + 4 (clan hall stage 1)
          
          const char2 = result.find(r => r.characterId === 'char2');
          expect(char2.totalValor).toBe(0);
      });
  });
});
