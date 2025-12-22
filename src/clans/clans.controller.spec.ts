import { Test, TestingModule } from '@nestjs/testing';
import { ClansController } from './clans.controller';
import { ClansService } from './clans.service';
import { ClansHistoryService } from './clans-history.service';
import { CreateClanDto } from './dto/create-clan.dto';
import { PermissionsGuard } from '../common/guards/permissions.guard';

describe('ClansController', () => {
  let controller: ClansController;
  let clansService: Partial<ClansService>;
  let clansHistoryService: Partial<ClansHistoryService>;

  beforeEach(async () => {
    clansService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'clan1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'clan1' }),
      getRoster: jest.fn().mockResolvedValue([]),
      leave: jest.fn().mockResolvedValue(undefined),
      getApplications: jest.fn().mockResolvedValue([]),
      apply: jest.fn().mockResolvedValue(undefined),
      processApplication: jest.fn().mockResolvedValue(undefined),
      updateRolePermissions: jest.fn().mockResolvedValue([]),
      changeMemberRole: jest.fn().mockResolvedValue({}),
      addCustomEventTemplate: jest.fn().mockResolvedValue({}),
      updateSettings: jest.fn().mockResolvedValue({}),
    };

    clansHistoryService = {
      getWeeklySummary: jest.fn().mockResolvedValue([]),
      uploadHistory: jest.fn().mockResolvedValue({ taskId: 'task1' }),
      getUploadTask: jest.fn().mockResolvedValue({ id: 'task1', status: 'PENDING' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClansController],
      providers: [
        { provide: ClansService, useValue: clansService },
        { provide: ClansHistoryService, useValue: clansHistoryService },
      ],
    })
    .overrideGuard(PermissionsGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<ClansController>(ClansController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of clans', async () => {
      await controller.findAll();
      expect(clansService.findAll).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a clan', async () => {
      const dto: CreateClanDto = { name: 'Test', icon: 'icon', description: 'desc' };
      const req = { user: { id: 'user1' } };
      await controller.create(req, dto);
      expect(clansService.create).toHaveBeenCalledWith('user1', dto);
    });
  });

  describe('getWeeklySummary', () => {
    it('should call history service', async () => {
      await controller.getWeeklySummary('clan1', '2025-W01');
      expect(clansHistoryService.getWeeklySummary).toHaveBeenCalledWith('clan1', '2025-W01');
    });
  });

  describe('uploadHistory', () => {
      it('should call history service upload', async () => {
          const req = { user: { id: 'user1' } };
          const file = { buffer: Buffer.from('test') };
          await controller.uploadHistory(req, 'clan1', file);
          expect(clansHistoryService.uploadHistory).toHaveBeenCalledWith('user1', 'clan1', file.buffer);
      });
  });
});
