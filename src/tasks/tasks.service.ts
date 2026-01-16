import {Injectable, Logger, NotFoundException} from '@nestjs/common';
import {Cron} from '@nestjs/schedule';
import {ClansService} from '../clans/clans.service';
import {EventsService} from '../events/events.service';
import {PrismaService} from '../prisma/prisma.service';
import {TelegramService} from '../telegram/telegram.service';
import {Markup} from 'telegraf';

interface TaskDefinition {
    id: string;
    name: string;
    schedule: string;
    description: string;
    execute: (context?: any) => Promise<void>;
}

@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);
    private readonly tasks = new Map<string, TaskDefinition>();

    constructor(
        private readonly clansService: ClansService,
        private readonly eventsService: EventsService,
        private readonly prisma: PrismaService,
        private readonly telegram: TelegramService,
    ) {
        this.registerTasks();
    }

    private registerTasks() {
        this.tasks.set('weekly-clan-contexts', {
            id: 'weekly-clan-contexts',
            name: 'Еженедельные контексты кланов',
            schedule: '* * * * *',
            description: 'Обновляет/создает еженедельный контекст (КХ, ЗУ, Ритм) для всех кланов',
            execute: this.createWeeklyClanContextsLogic.bind(this),
        });

        this.tasks.set('rally-notifications', {
            id: 'rally-notifications',
            name: 'Уведомления о начале сбора',
            schedule: '* * * * *',
            description: 'Проверяет события и отправляет уведомления о начале сбора',
            execute: this.rallyNotificationsLogic.bind(this),
        });

        this.tasks.set('populate-db', {
            id: 'populate-db',
            name: 'Наполнить БД',
            schedule: 'MANUAL',
            description: 'Генерирует тестовые данные (Кланы, Персонажи, События)',
            execute: this.populateDbLogic.bind(this),
        });

        this.tasks.set('clear-db', {
            id: 'clear-db',
            name: 'Очистить БД',
            schedule: 'MANUAL',
            description: 'Удаляет все данные (Кланы, Персонажи, События)',
            execute: this.clearDbLogic.bind(this),
        });

        this.tasks.set('fix-short-ids', {
            id: 'fix-short-ids',
            name: 'Исправить Short ID',
            schedule: 'MANUAL',
            description: 'Генерирует shortId для всех персонажей, у которых его нет',
            execute: this.fixShortIdsLogic.bind(this),
        });
    }

    private async fixShortIdsLogic() {
        this.logger.log('Fixing short IDs...');
        const chars = await this.prisma.character.findMany({
            where: {
                OR: [
                    { shortId: null },
                    { shortId: { contains: '-' } } // UUIDs usually have hyphens
                ]
            }
        });

        for (const char of chars) {
            const shortId = Math.random().toString(36).substring(2, 8);
            await this.prisma.character.update({
                where: { id: char.id },
                data: { shortId }
            });
        }
        this.logger.log(`Fixed ${chars.length} short IDs.`);
    }

    private async clearDbLogic() {
        this.logger.log('Clearing DB...');
        await this.prisma.eventParticipant.deleteMany();
        await this.prisma.squad.deleteMany();
        await this.prisma.event.deleteMany();

        await this.prisma.clanHallProgress.deleteMany();
        await this.prisma.forbiddenKnowledge.deleteMany();
        await this.prisma.rhythm.deleteMany();
        await this.prisma.clanHall.deleteMany();
        await this.prisma.clanWeeklyContext.deleteMany();

        await this.prisma.clanApplication.deleteMany();
        await this.prisma.auditLog.deleteMany();
        await this.prisma.factionHistory.deleteMany();

        await this.prisma.user.updateMany({data: {mainCharacterId: null}});

        await this.prisma.character.deleteMany();
        await this.prisma.clan.deleteMany();
        this.logger.log('DB Cleared.');
    }

    private async populateDbLogic(context?: any) {
        this.logger.log('Populating DB...');
        const classes = [
            'Воин', 'Маг', 'Стрелок',
            'Оборотень', 'Друид', 'Странник',
            'Лучник', 'Жрец', 'Паладин',
            'Убийца', 'Шаман', 'Бард',
            'Страж', 'Мистик', 'Дух крови',
            'Призрак', 'Жнец'
        ];
        const clanNames = ['RedHorde', 'Alliance', 'Shadows', 'LightKeepers', 'Noobs'];
        const servers = ['Центавр', 'Фенрир', 'Мицар', 'Капелла'];

        const clans = [];
        for (const name of clanNames) {
            const clan = await this.prisma.clan.create({
                data: {
                    name: `${name}_${Math.floor(Math.random() * 1000)}`,
                    server: servers[Math.floor(Math.random() * servers.length)],
                    settings: {},
                    description: 'Generated clan',
                }
            });
            clans.push(clan);
        }

        if (context?.userId) {
            const user = await this.prisma.user.findUnique({
                where: {id: context.userId},
                include: {characters: true}
            });

            if (user) {
                if (user.mainCharacterId) {
                    const mainChar = await this.prisma.character.findUnique({
                        where: {id: user.mainCharacterId},
                        include: {clan: true}
                    });
                    if (mainChar?.clan) {
                        clans.push(mainChar.clan);
                    }
                }

                for (const cls of classes) {
                    const exists = user.characters.find(c => c.class === cls);
                    if (!exists) {
                        await this.prisma.character.create({
                            data: {
                                name: `My_${cls}_${Math.floor(Math.random() * 1000)}`,
                                server: servers[0],
                                class: cls,
                                userId: user.id,
                                level: 100,
                            }
                        });
                    }
                }
            }
        }

        for (let i = 0; i < 50; i++) {
            const username = `bot_${Date.now()}_${i}`;
            const user = await this.prisma.user.create({
                data: {
                    username: username,
                    role: 'USER',
                }
            });

            const clan = clans[Math.floor(Math.random() * clans.length)];
            const cls = classes[Math.floor(Math.random() * classes.length)];

            const char = await this.prisma.character.create({
                data: {
                    name: `Char_${i}`,
                    server: clan.server,
                    class: cls,
                    userId: user.id,
                    clanId: clan.id,
                    clanRole: 'MEMBER',
                    level: 100 + Math.floor(Math.random() * 5),
                }
            });

            await this.prisma.user.update({
                where: {id: user.id},
                data: {mainCharacterId: char.id}
            });
        }

        await this.createWeeklyClanContextsLogic();

        const contexts = await this.prisma.clanWeeklyContext.findMany();
        for (const ctx of contexts) {
            await this.prisma.event.create({
                data: {
                    type: 'CLAN_HALL',
                    name: 'КХ Среда',
                    date: new Date(ctx.dateStart.getTime() + 2 * 24 * 60 * 60 * 1000),
                    status: 'UPCOMING',
                    contextId: ctx.id,
                }
            });
        }
        this.logger.log('DB Populated.');
    }

    @Cron('* * * * *')
    async handleWeeklyEvents() {
        await this.runTask('weekly-clan-contexts');
        await this.runTask('rally-notifications');
    }

    async runTask(taskId: string, context?: any) {
        const task = this.tasks.get(taskId);
        if (!task) throw new NotFoundException(`Task ${taskId} not found`);

        this.logger.log(`Starting task: ${taskId}`);
        const start = new Date();

        let log;
        try {
            log = await this.prisma.taskLog.create({
                data: {
                    taskName: taskId,
                    status: 'RUNNING',
                    startedAt: start
                }
            });
        } catch (e) {
            this.logger.error('Failed to create task log', e);
            // Try to run anyway? Or fail?
            // If DB is down, maybe fail.
            return;
        }

        try {
            await task.execute(context);
            const end = new Date();

            await this.prisma.taskLog.update({
                where: {id: log.id},
                data: {
                    status: 'SUCCESS',
                    endedAt: end,
                    duration: end.getTime() - start.getTime(),
                    message: 'Completed successfully'
                }
            });
        } catch (e) {
            const end = new Date();
            const err = e as Error;

            await this.prisma.taskLog.update({
                where: {id: log.id},
                data: {
                    status: 'FAILED',
                    endedAt: end,
                    duration: end.getTime() - start.getTime(),
                    message: err.message,
                    logs: err.stack
                }
            });
            this.logger.error(`Task ${taskId} failed`, err.stack);
        }
    }

    // The actual logic for weekly events
    private async createWeeklyClanContextsLogic() {
        this.logger.debug('Starting weekly events creation logic...');

        const now = new Date();
        // Build ISO week string like in EventsService
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const dayNum = d.getUTCDay() || 7; // 1..7, Monday=1
        d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to Thursday to get ISO year
        const isoYear = d.getUTCFullYear();
        const yearStart = new Date(Date.UTC(isoYear, 0, 1));
        const isoWeek = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        const weekIsoStr = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;

        const clans = await this.clansService.findAll();

        for (const clan of clans) {
            this.logger.debug(`Processing clan ${clan.name} (${clan.id})`);

            // Ensure ClanWeeklyContext exists for this clan and week
            let context = await this.prisma.clanWeeklyContext.findUnique({
                where: {clanId_weekIso: {clanId: clan.id, weekIso: weekIsoStr}}
            });

            if (!context) {
                // Calculate start/end of ISO week (Mon 00:00:00.000 to Sun 23:59:59.999)
                const weekNum = isoWeek;
                const simple = new Date(Date.UTC(isoYear, 0, 4));
                const dow = simple.getUTCDay() || 7; // 1..7
                simple.setUTCDate(simple.getUTCDate() + (weekNum - 1) * 7 - dow + 1);
                const startOfIsoWeek = simple;
                const endOfIsoWeek = new Date(startOfIsoWeek);
                endOfIsoWeek.setDate(endOfIsoWeek.getDate() + 7);
                endOfIsoWeek.setMilliseconds(-1);

                this.logger.debug(`Creating weekly context for clan ${clan.name} week ${weekIsoStr}`);
                context = await this.prisma.clanWeeklyContext.create({
                    data: {
                        clanId: clan.id,
                        weekIso: weekIsoStr,
                        weekNumber: weekNum,
                        dateStart: startOfIsoWeek,
                        dateEnd: endOfIsoWeek,
                        clanHall: {create: {}}
                    }
                });
            } else {
                this.logger.debug(`Weekly context already exists for clan ${clan.name} week ${weekIsoStr}`);
            }
        }
    }

    private async rallyNotificationsLogic() {
        this.logger.debug('Checking events for rally notifications...');
        const now = new Date();
        const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);

        const events = await this.prisma.event.findMany({
            where: {
                rallyTime: {
                    gte: now,
                    lte: oneMinuteFromNow
                },
                status: 'UPCOMING'
            },
            include: {
                clanWeeklyContext: {
                    include: { clan: true }
                }
            }
        });

        for (const event of events) {
            const clan = event.clanWeeklyContext.clan;
            const members = await this.prisma.character.findMany({
                where: { clanId: clan.id },
                include: { user: { include: { notificationSettings: true } } }
            });

            const dateStr = new Date(event.date).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            const message = `<b>Сбор на событие начался!</b>\nСобытие: <b>${event.name}</b>\nДата: ${dateStr}`;

            // Group by telegramId to avoid duplicate messages per user
            const notifiedTelegramIds = new Set<string>();

            for (const member of members) {
                if (member.user.telegramId && 
                    member.user.notificationSettings?.pvpEventRally && 
                    !notifiedTelegramIds.has(member.user.telegramId)) {
                    
                    const sent = await this.telegram.sendMessage(member.user.telegramId, message);
                    if (sent) {
                        await this.prisma.eventParticipant.upsert({
                            where: {
                                eventId_characterId: {
                                    eventId: event.id,
                                    characterId: member.id
                                }
                            },
                            create: {
                                eventId: event.id,
                                characterId: member.id,
                                status: 'UNDECIDED',
                                telegramRallyMessageId: sent.message_id.toString()
                            },
                            update: {
                                telegramRallyMessageId: sent.message_id.toString()
                            }
                        });
                    }
                    notifiedTelegramIds.add(member.user.telegramId);
                }
            }

            // Notify Group
            if (clan.telegramGroupId) {
                const groupMessage = await this.telegram.sendMessage(clan.telegramGroupId, message, {
                    message_thread_id: clan.telegramThreadId
                });
                if (groupMessage) {
                    await this.prisma.event.update({
                        where: { id: event.id },
                        data: { telegramRallyGroupMessageId: groupMessage.message_id.toString() }
                    });
                    if (!clan.telegramThreadId) {
                        await this.telegram.pinMessage(clan.telegramGroupId, groupMessage.message_id);
                    }
                }
            }
        }
    }

    getTasks() {
        return Array.from(this.tasks.values()).map(t => ({
            id: t.id,
            name: t.name,
            schedule: t.schedule,
            description: t.description
        }));
    }

    async getHistory(taskId?: string) {
        return this.prisma.taskLog.findMany({
            where: taskId ? {taskName: taskId} : undefined,
            orderBy: {startedAt: 'desc'},
            take: 50
        });
    }

    private getISOWeek(d: Date): number {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    }

    private getMonday(d: Date): Date {
        d = new Date(d);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(d.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday;
    }
}
