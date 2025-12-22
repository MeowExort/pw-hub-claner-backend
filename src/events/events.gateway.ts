import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SquadDto } from './dto/squad.dto';
import { ClanPermission } from '../common/constants/permissions';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly eventsService: EventsService,
    private readonly prisma: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    // console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinEvent')
  async handleJoinEvent(
    @MessageBody() data: { eventId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data.eventId) {
      client.join(`event_${data.eventId}`);

      const event = await this.prisma.event.findUnique({
        where: { id: data.eventId },
        include: { squads: true },
      });

      if (event) {
        client.emit('squadsUpdated', event.squads);
      }
    }
  }

  @SubscribeMessage('leaveEvent')
  handleLeaveEvent(
    @MessageBody() data: { eventId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data.eventId) {
      client.leave(`event_${data.eventId}`);
    }
  }

  @SubscribeMessage('updateSquads')
  async handleUpdateSquads(
    @MessageBody() data: { eventId: string; squads: SquadDto[]; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { eventId, squads, userId } = data;

      console.log('Squads update', data, 'userId: ', userId, 'eventId: ', eventId, 'squads: ', squads, 'userId:')
      if (!userId || !eventId) {
        console.error('Missing userId or eventId in updateSquads', data);
        return;
      }

      // Fetch character to check permissions
      const character = await this.prisma.character.findFirst({
        where: { userId },
        include: { clan: true },
      });

      if (!character) {
        console.error('Character not found for userId', userId);
        return;
      }

      if (
        this.eventsService.hasPermission(
          character,
          ClanPermission.CAN_MANAGE_SQUADS,
        )
      ) {
        // Save to DB
        const updatedEvent = await this.eventsService.setSquads(userId, eventId, squads, character);

        console.log('Updated event', updatedEvent);
        // Broadcast to others in the room
        client.to(`event_${eventId}`).emit('squadsUpdated', updatedEvent.squads);
      } else {
        console.error('Permission denied for updateSquads', userId);
      }
    } catch (e) {
      console.error('Error in handleUpdateSquads', e);
    }
  }
}
