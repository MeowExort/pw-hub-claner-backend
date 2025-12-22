import { Test, TestingModule } from '@nestjs/testing';
import { ClansService } from './clans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateClanDto } from './dto/create-clan.dto';

describe('ClansService', () => {
  let service: ClansService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    const prismaMock = {
      clan: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn() },
      character: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    const auditMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClansService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<ClansService>(ClansService);
    prisma = module.get<PrismaService>(PrismaService);
    audit = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a clan', async () => {
        const userId = 'user1';
        const dto: CreateClanDto = { name: 'NewClan', icon: 'icon.png', description: 'Desc' };
        
        prisma.user.findUnique.mockResolvedValue({ 
            id: userId, 
            mainCharacterId: 'char1',
            characters: [{ id: 'char1', server: 'Server1', clanId: null }] 
        });

        prisma.clan.create.mockResolvedValue({ id: 'clan1', ...dto });

        const result = await service.create(userId, dto);
        expect(result).toBeDefined();
        expect(prisma.clan.create).toHaveBeenCalled();
        expect(prisma.character.update).toHaveBeenCalledWith({
            where: { id: 'char1' },
            data: expect.objectContaining({ clanId: 'clan1' })
        });
    });
  });
});
