import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { SwitchActiveCharacterDto } from './dto/switch-character.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: Partial<UsersService>;

  const mockUser = {
    id: 'user-id',
    username: 'testuser',
    email: 'test@test.com',
    characters: [],
  };

  const mockClan = {
    id: 'clan-id',
    name: 'TestClan',
  };

  beforeEach(async () => {
    usersService = {
      getCurrentUser: jest.fn().mockResolvedValue(mockUser),
      findOrCreate: jest.fn().mockResolvedValue(mockUser),
      createCharacter: jest.fn().mockResolvedValue({ id: 'char-id', ...mockUser }),
      switchActiveCharacter: jest.fn().mockResolvedValue({ ...mockUser, mainCharacterId: 'char-id' }),
      getMyClan: jest.fn().mockResolvedValue(mockClan),
      getMyActivity: jest.fn().mockResolvedValue({ characterId: 'char-id', rhythm: {} }),
      getMyPermissions: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCurrentUser', () => {
    it('should return current user', async () => {
      const req = { user: { id: 'user-id' } };
      const result = await controller.getCurrentUser(req);
      expect(usersService.findOrCreate).toHaveBeenCalledWith(req.user);
      expect(result).toEqual(mockUser);
    });
  });

  describe('createCharacter', () => {
    it('should create a character', async () => {
      const req = { user: { id: 'user-id' } };
      const dto: CreateCharacterDto = {
        name: 'CharName',
        server: 'Центавр',
        class: 'Воин',
        pwobsLink: 'https://pwobs.com/centaur/players/12345',
      };
      await controller.createCharacter(req, dto);
      expect(usersService.createCharacter).toHaveBeenCalledWith('user-id', dto);
    });
  });

  describe('switchActiveCharacter', () => {
    it('should switch active character', async () => {
      const req = { user: { id: 'user-id' } };
      const dto: SwitchActiveCharacterDto = { characterId: 'char-id' };
      await controller.switchActiveCharacter(req, dto);
      expect(usersService.switchActiveCharacter).toHaveBeenCalledWith('user-id', 'char-id');
    });
  });

  describe('getMyClan', () => {
    it('should return user clan', async () => {
      const req = { user: { id: 'user-id' } };
      const result = await controller.getMyClan(req);
      expect(usersService.getMyClan).toHaveBeenCalledWith('user-id');
      expect(result).toEqual(mockClan);
    });
  });

  describe('getMyActivity', () => {
    it('should return activity mock', async () => {
      const req = { user: { id: 'user-id' } };
      const week = undefined; // Mock implicit undefined query param
      const result = await controller.getMyActivity(req, week);
      expect(usersService.getMyActivity).toHaveBeenCalledWith('user-id', undefined);
      expect(result).toHaveProperty('characterId');
      expect(result).toHaveProperty('rhythm');
    });
  });
});
