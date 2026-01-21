import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const [
      totalUsers,
      usersWithTelegram,
      totalCharacters,
      totalClans,
      totalEvents,
      totalTaskLogs,
      onlineUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { telegramId: { not: null } } }),
      this.prisma.character.count(),
      this.prisma.clan.count(),
      this.prisma.event.count(),
      this.prisma.taskLog.count(),
      this.prisma.user.count({
        where: {
          updatedAt: {
            gte: fifteenMinutesAgo,
          },
        },
      }),
    ]);

    // Дополнительная статистика по событиям
    const eventsByType = await this.prisma.event.groupBy({
      by: ['type'],
      _count: true,
    });

    // Статистика по персонажам (по классам)
    const charactersByClass = await this.prisma.character.groupBy({
      by: ['class'],
      _count: true,
    });

    return {
      users: {
        total: totalUsers,
        withTelegram: usersWithTelegram,
        online: onlineUsers,
      },
      characters: {
        total: totalCharacters,
        byClass: charactersByClass,
      },
      clans: {
        total: totalClans,
      },
      events: {
        total: totalEvents,
        byType: eventsByType,
      },
      reports: {
        totalTaskLogs,
      },
    };
  }

  async getAllClansWithLastAction() {
    const clans = await this.prisma.clan.findMany({
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    const clansWithLastAction = await Promise.all(
      clans.map(async (clan) => {
        const [lastAudit, lastHistory, lastEvent] = await Promise.all([
          this.prisma.auditLog.findFirst({
            where: { clanId: clan.id },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.factionHistory.findFirst({
            where: { clanId: clan.id },
            orderBy: { date: 'desc' },
          }),
          this.prisma.event.findFirst({
            where: {
              clanWeeklyContext: {
                clanId: clan.id,
              },
            },
            orderBy: { date: 'desc' },
          }),
        ]);

        const dates = [
          clan.updatedAt,
          lastAudit?.createdAt,
          lastHistory?.date,
          lastEvent?.date,
        ].filter(Boolean) as Date[];

        const lastActionDate =
          dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : clan.updatedAt;

        return {
          ...clan,
          lastActionDate,
        };
      }),
    );

    return clansWithLastAction.sort((a, b) => b.lastActionDate.getTime() - a.lastActionDate.getTime());
  }

  async deleteClan(id: string) {
    // Очищаем все связанные данные в правильном порядке, чтобы не нарушать целостность (Foreign Key Constraints)
    await this.prisma.$transaction([
      // 1. События и их участники/отряды
      this.prisma.eventParticipant.deleteMany({ where: { event: { clanWeeklyContext: { clanId: id } } } }),
      this.prisma.squad.deleteMany({ where: { event: { clanWeeklyContext: { clanId: id } } } }),
      this.prisma.event.deleteMany({ where: { clanWeeklyContext: { clanId: id } } }),
      
      // 2. Данные Кланхолла
      this.prisma.clanHallProgress.deleteMany({ where: { clanHall: { clanWeeklyContext: { clanId: id } } } }),
      this.prisma.clanHall.deleteMany({ where: { clanWeeklyContext: { clanId: id } } }),
      
      // 3. Другие еженедельные записи
      this.prisma.rhythm.deleteMany({ where: { clanWeeklyContext: { clanId: id } } }),
      this.prisma.forbiddenKnowledge.deleteMany({ where: { clanWeeklyContext: { clanId: id } } }),
      
      // 4. Сам контекст
      this.prisma.clanWeeklyContext.deleteMany({ where: { clanId: id } }),
      
      // 5. Заявки, история и аудит
      this.prisma.applicationVote.deleteMany({ where: { application: { clanId: id } } }),
      this.prisma.clanApplication.deleteMany({ where: { clanId: id } }),
      this.prisma.factionHistory.deleteMany({ where: { clanId: id } }),
      this.prisma.auditLog.deleteMany({ where: { clanId: id } }),
      
      // 6. Отвязка персонажей
      this.prisma.character.updateMany({
        where: { clanId: id },
        data: { clanId: null, clanRole: null, clanJoinDate: null },
      }),
      
      // 7. Удаление самого клана
      this.prisma.clan.delete({ where: { id } }),
    ]);
    
    return { success: true };
  }

  async getClanStats(id: string) {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const [eventsCount, membersCount, applicationsCount] = await Promise.all([
      this.prisma.event.count({
        where: {
          clanWeeklyContext: { clanId: id },
          date: { gte: twoWeeksAgo },
        },
      }),
      this.prisma.character.count({ where: { clanId: id } }),
      this.prisma.clanApplication.count({
        where: { clanId: id, createdDate: { gte: twoWeeksAgo } },
      }),
    ]);

    const events = await this.prisma.event.findMany({
      where: {
        clanWeeklyContext: { clanId: id },
        date: { gte: twoWeeksAgo },
      },
      include: {
        _count: { select: { participants: true } },
      },
    });

    return {
      eventsCount,
      membersCount,
      applicationsCount,
      events,
    };
  }

  async getClanActivity(id: string) {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const [auditLogs, factionHistory] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { clanId: id, createdAt: { gte: twoWeeksAgo } },
        orderBy: { createdAt: 'desc' },
        include: { actor: true },
      }),
      this.prisma.factionHistory.findMany({
        where: { clanId: id, date: { gte: twoWeeksAgo } },
        orderBy: { date: 'desc' },
      }),
    ]);

    const activity = [
      ...auditLogs.map((log) => ({
        type: 'AUDIT',
        date: log.createdAt,
        action: log.action,
        actor: log.actor?.name || 'System',
        details: log.details,
      })),
      ...factionHistory.map((history) => ({
        type: 'HISTORY',
        date: history.date,
        action: history.action,
        description: history.description,
        actor: 'Game Sync',
      })),
    ];

    return activity.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}
