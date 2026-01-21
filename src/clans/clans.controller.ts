import { Controller, Get, Post, Patch, Put, Delete, Body, Param, UseGuards, Req, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { ClansService } from './clans.service';
import { ClansHistoryService } from './clans-history.service';
import { CreateClanDto } from './dto/create-clan.dto';
import { CreateApplicationDto, UpdateApplicationDto } from './dto/clan-application.dto';
import { UpdateClanSettingsDto, UpdateRolePermissionsDto, AddCustomEventTemplateDto, ChangeMemberRoleDto } from './dto/update-settings.dto';
import { UpdateWeeklyStatsDto } from './dto/update-weekly-stats.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ClanPermission } from '../common/constants/permissions';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Clans')
@Controller('clans')
export class ClansController {
  constructor(
      private readonly clansService: ClansService,
      private readonly clansHistoryService: ClansHistoryService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all clans' })
  findAll() {
    return this.clansService.findAll();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a clan' })
  create(@Req() req, @Body() dto: CreateClanDto) {
    return this.clansService.create(req.user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clan details' })
  findOne(@Param('id') id: string) {
    return this.clansService.findOne(id);
  }

  @Get(':id/summary')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get weekly summary' })
  getWeeklySummary(@Param('id') id: string, @Query('week') week: string) {
    return this.clansHistoryService.getWeeklySummary(id, week);
  }

  @Put(':id/summary')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(ClanPermission.MANUAL_PVE_EDIT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update weekly stats manually' })
  updateWeeklyStats(
      @Param('id') id: string,
      @Query('week') week: string,
      @Body() dto: UpdateWeeklyStatsDto
  ) {
      return this.clansHistoryService.updateWeeklyStats(id, week, dto);
  }

  @Get(':id/members')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get clan roster' })
  getMembers(@Param('id') id: string) {
    return this.clansService.getRoster(id);
  }

  @Delete(':id/members/me')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Leave a clan' })
  leave(@Req() req, @Param('id') id: string) {
    return this.clansService.leave(req.user.id, id);
  }

  @Get(':id/applications')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get clan applications' })
  getApplications(@Param('id') id: string) {
    return this.clansService.getApplications(id);
  }

  @Post(':id/applications')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to join a clan' })
  apply(@Req() req, @Param('id') id: string, @Body() dto: CreateApplicationDto) {
    return this.clansService.apply(req.user.id, id, dto);
  }

  @Patch(':id/applications/:appId')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(ClanPermission.CAN_MANAGE_MEMBERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process application' })
  processApplication(
      @Req() req, 
      @Param('id') id: string, 
      @Param('appId') appId: string, 
      @Body() dto: UpdateApplicationDto
  ) {
    return this.clansService.processApplication(req.user.id, id, appId, dto);
  }

  @Put(':id/permissions')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(ClanPermission.CAN_EDIT_SETTINGS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update role permissions' })
  updatePermissions(@Req() req, @Param('id') id: string, @Body() dto: UpdateRolePermissionsDto) {
    return this.clansService.updateRolePermissions(req.user.id, id, dto);
  }

  @Patch(':id/members/:memberId/role')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(ClanPermission.MANAGE_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change member role' })
  changeRole(
      @Req() req, 
      @Param('id') id: string, 
      @Param('memberId') memberId: string, 
      @Body() dto: ChangeMemberRoleDto
  ) {
      return this.clansService.changeMemberRole(req.user.id, id, memberId, dto.role);
  }

  @Delete(':id/members/:memberId')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(ClanPermission.CAN_KICK_MEMBERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kick member from clan' })
  kickMember(
      @Req() req,
      @Param('id') id: string,
      @Param('memberId') memberId: string
  ) {
      return this.clansService.kickMember(req.user.id, id, memberId);
  }

  @Post(':id/templates')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(ClanPermission.CAN_EDIT_SETTINGS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add custom event template' })
  addTemplate(@Req() req, @Param('id') id: string, @Body() dto: AddCustomEventTemplateDto) {
      return this.clansService.addCustomEventTemplate(req.user.id, id, dto);
  }

  @Patch(':id/settings')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(ClanPermission.CAN_EDIT_SETTINGS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update clan settings' })
  updateSettings(@Req() req, @Param('id') id: string, @Body() dto: UpdateClanSettingsDto) {
      return this.clansService.updateSettings(req.user.id, id, dto);
  }

  @Post(':id/clan-hall')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(ClanPermission.CAN_UPLOAD_REPORTS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark clan hall attendance' })
  markAttendance(
      @Req() req,
      @Param('id') id: string,
      @Body() dto: { characterId: string, stage: number, valor: number, gold: number }
  ) {
      return this.clansService.markClanHallAttendance(req.user.id, id, dto.characterId, dto.stage, dto.valor, dto.gold);
  }

  @Post(':id/history/upload')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload faction history' })
  uploadHistory(
      @Req() req, 
      @Param('id') id: string, 
      @UploadedFile() file: any
  ) {
      return this.clansHistoryService.uploadHistory(req.user.id, id, file.buffer);
  }

  @Get(':id/history/tasks/:taskId')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get upload task status' })
  getUploadTask(@Param('taskId') taskId: string) {
      return this.clansHistoryService.getUploadTask(taskId);
  }
}
