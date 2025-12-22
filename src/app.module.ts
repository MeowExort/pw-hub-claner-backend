import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { ClansModule } from './clans/clans.module';
import { AuditModule } from './audit/audit.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    EventsModule,
    AuthModule,
    ClansModule,
    AuditModule,
    TasksModule,
  ],
})
export class AppModule {}
