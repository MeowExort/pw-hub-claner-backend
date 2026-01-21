import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';
import { SystemAdminGuard } from '../common/guards/system-admin.guard';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), SystemAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('clans')
  async getAllClans() {
    return this.adminService.getAllClansWithLastAction();
  }

  @Get('clans/:id/stats')
  async getClanStats(@Param('id') id: string) {
    return this.adminService.getClanStats(id);
  }

  @Get('clans/:id/activity')
  async getClanActivity(@Param('id') id: string) {
    return this.adminService.getClanActivity(id);
  }

  @Delete('clans/:id')
  async deleteClan(@Param('id') id: string) {
    return this.adminService.deleteClan(id);
  }
}
