import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    clanId: string,
    actorId: string | null,
    action: string,
    target: string | null = null,
    details: any = null,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          clanId,
          actorId,
          action,
          target,
          details: details ?? undefined,
        },
      });
    } catch (e) {
      console.error('Failed to create audit log', e);
    }
  }

  async getLogs(
    clanId: string,
    limit = 100,
    offset = 0,
    filters?: {
      action?: string;
      actorId?: string;
      target?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const where: any = { clanId };

    if (filters) {
      if (filters.action) where.action = filters.action;
      if (filters.actorId) where.actorId = filters.actorId;
      if (filters.target) where.target = { contains: filters.target, mode: 'insensitive' };

      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
        if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
      }
    }

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            class: true,
          },
        },
      },
    });
  }
}
