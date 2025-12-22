import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AuthGuard } from '@nestjs/passport';

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: Partial<EventsService>;

  const mockEvent = {
    id: 'event-id',
    type: 'CLAN_HALL',
    name: 'Test Event',
    date: new Date(),
    status: 'UPCOMING',
    participants: [],
    squads: [],
  };

  beforeEach(async () => {
    eventsService = {
      findAll: jest.fn().mockResolvedValue([mockEvent]),
      findOne: jest.fn().mockResolvedValue(mockEvent),
      create: jest.fn().mockResolvedValue(mockEvent),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: eventsService },
      ],
    })
    .overrideGuard(PermissionsGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(AuthGuard('jwt'))
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<EventsController>(EventsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of events', async () => {
      const result = await controller.findAll({ character: {} } as any);
      expect(result).toEqual([mockEvent]);
      expect(eventsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single event', async () => {
      const result = await controller.findOne({ character: {} } as any, 'event-id');
      expect(result).toEqual(mockEvent);
      expect(eventsService.findOne).toHaveBeenCalledWith('event-id', expect.anything());
    });
  });

  describe('create', () => {
    it('should create a new event', async () => {
      const dto: CreateEventDto = {
        type: 'CLAN_HALL',
        name: 'New Event',
        date: '2025-12-01T18:00:00.000Z' as any,
      } as any; 

      const req = { character: { clanId: 'clan-id' } };
      const result = await controller.create(req, dto);
      expect(result).toEqual(mockEvent);
      expect(eventsService.create).toHaveBeenCalledWith(dto, req.character);
    });
  });
});
