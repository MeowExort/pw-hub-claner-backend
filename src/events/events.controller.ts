import { Controller, Get, Post, Body, Param, Put, Patch, Delete, UseGuards, Req, BadRequestException, ParseArrayPipe, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { RsvpDto } from './dto/rsvp.dto';
import { SquadDto } from './dto/squad.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ClanPermission } from '../common/constants/permissions';

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Получение всех событий', description: 'Возвращает список всех клановых событий' })
  @ApiResponse({ status: 200, description: 'Список событий' })
  findAll(@Req() req, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('history') history?: string) {
    return this.eventsService.findAll(req.character, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
        history: history === 'true'
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получение события по ID', description: 'Возвращает детальную информацию о событии' })
  @ApiResponse({ status: 200, description: 'Информация о событии' })
  @ApiResponse({ status: 404, description: 'Событие не найдено' })
  findOne(@Req() req, @Param('id') id: string) {
    return this.eventsService.findOne(id, req.character);
  }

  @Post()
  @RequirePermissions(ClanPermission.CAN_CREATE_EVENTS)
  @ApiOperation({ summary: 'Создание события', description: 'Создает новое клановое событие' })
  @ApiResponse({ status: 201, description: 'Событие создано' })
  create(@Req() req, @Body() dto: CreateEventDto) {
    return this.eventsService.create(dto, req.character);
  }

  @Post(':id/rsvp')
  @ApiOperation({ summary: 'RSVP for event' })
  rsvp(@Req() req, @Param('id') id: string, @Body() dto: RsvpDto) {
    if (req.character.id !== dto.characterId) {
      throw new BadRequestException('Can only RSVP for current active character');
    }
    return this.eventsService.rsvp(req.user.id, id, dto);
  }

  @Put(':id/squads')
  @RequirePermissions(ClanPermission.CAN_MANAGE_SQUADS)
  @ApiOperation({ summary: 'Set squads' })
  setSquads(@Req() req, @Param('id') id: string, @Body(new ParseArrayPipe({ items: SquadDto })) squads: SquadDto[]) {
    return this.eventsService.setSquads(req.user.id, id, squads, req.character);
  }

  @Patch(':id/complete')
  @RequirePermissions(ClanPermission.CAN_EDIT_EVENTS)
  @ApiOperation({ summary: 'Complete event' })
  @ApiResponse({ status: 200, description: 'Event completed' })
  complete(@Req() req, @Param('id') id: string, @Body() body: { reportUploaded: boolean }) {
      return this.eventsService.completeEvent(req.user.id, id, body.reportUploaded);
  }

  @Delete(':id')
  @RequirePermissions(ClanPermission.CAN_DELETE_EVENTS)
  @ApiOperation({ summary: 'Delete event' })
  @ApiResponse({ status: 200, description: 'Event deleted' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  delete(@Req() req, @Param('id') id: string) {
    return this.eventsService.delete(id, req.character);
  }
}
