import { Module } from '@nestjs/common';
import { ClansController } from './clans.controller';
import { ClansService } from './clans.service';
import { ClansHistoryService } from './clans-history.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FactionHistoryParser } from './faction-history.parser';

@Module({
  imports: [PrismaModule],
  controllers: [ClansController],
  providers: [ClansService, ClansHistoryService, FactionHistoryParser],
  exports: [ClansService, ClansHistoryService],
})
export class ClansModule {}
