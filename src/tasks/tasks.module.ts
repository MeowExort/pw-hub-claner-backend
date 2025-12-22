import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { EventsModule } from '../events/events.module';
import { ClansModule } from '../clans/clans.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    EventsModule,
    ClansModule,
    PrismaModule
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
