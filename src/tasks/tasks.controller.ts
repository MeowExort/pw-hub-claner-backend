import { Controller, Get, Post, Param, UseGuards, Query, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TasksService } from './tasks.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SystemAdminGuard } from '../common/guards/system-admin.guard';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(AuthGuard('jwt'), SystemAdminGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all scheduled tasks' })
  getTasks() {
    return this.tasksService.getTasks();
  }

  @Get('history')
  @ApiOperation({ summary: 'Get task execution history' })
  getHistory(@Query('taskId') taskId?: string) {
    return this.tasksService.getHistory(taskId);
  }

  @Post(':id/run')
  @ApiOperation({ summary: 'Manually run a task' })
  async runTask(@Param('id') id: string, @Req() req: any) {
    await this.tasksService.runTask(id, { userId: req.user?.id });
    return { status: 'started' };
  }
}
