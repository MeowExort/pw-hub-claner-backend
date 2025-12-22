import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ClanPermission } from '../common/constants/permissions';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Audit')
@Controller('clans/:clanId/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(ClanPermission.CAN_VIEW_LOGS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get audit logs' })
  getLogs(
    @Param('clanId') clanId: string,
    @Query('limit') limit = 100,
    @Query('offset') offset = 0,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('target') target?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.auditService.getLogs(clanId, Number(limit), Number(offset), {
      action,
      actorId,
      target,
      dateFrom,
      dateTo,
    });
  }
}
