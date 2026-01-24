import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FactionHistoryParser, ParsedFactionRecord } from './faction-history.parser';
import { randomUUID } from 'crypto';
import { UpdateWeeklyStatsDto } from './dto/update-weekly-stats.dto';

export function getWeekIso(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

@Injectable()
export class ClansHistoryService {
    private uploadTasks = new Map<string, {
        id: string;
        status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
        progress: number;
        total: number;
        result?: any;
        error?: string;
    }>();

    constructor(
        private prisma: PrismaService,
        private historyParser: FactionHistoryParser,
        private audit: AuditService
    ) {}

    async getUploadTask(taskId: string) {
        return this.uploadTasks.get(taskId);
    }

    async uploadHistory(userId: string, clanId: string, fileBuffer: Buffer) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { characters: true } });
        const char = user.characters.find(c => c.clanId === clanId);
        
        if (!char) throw new ForbiddenException('Not a member of this clan');

        const taskId = randomUUID();
        this.uploadTasks.set(taskId, {
            id: taskId,
            status: 'PENDING',
            progress: 0,
            total: 0
        });

        this.processHistoryTask(taskId, userId, clanId, fileBuffer).catch(err => {
            console.error('History processing error', err);
            const task = this.uploadTasks.get(taskId);
            if (task) {
                task.status = 'ERROR';
                task.error = err.message;
            }
        });

        return { taskId };
    }

    async processHistoryTask(taskId: string, userId: string, clanId: string, fileBuffer: Buffer) {
        const task = this.uploadTasks.get(taskId);
        if (!task) return;

        try {
            task.status = 'PROCESSING';
            const records = this.historyParser.parse(fileBuffer);
            task.total = records.length;

            if (records.length === 0) {
                task.status = 'COMPLETED';
                task.result = {
                    processed: 0,
                    total: 0,
                    khChecksAdded: 0,
                    zuCirclesAdded: 0,
                    newDancers: 0,
                    finishedDancers: 0
                };
                return;
            }

            let minDate = records[0].date;
            let maxDate = records[0].date;
            for (const r of records) {
                if (r.date < minDate) minDate = r.date;
                if (r.date > maxDate) maxDate = r.date;
            }
            
            const existingIds = new Set(
                (await this.prisma.factionHistory.findMany({
                    where: {
                        clanId,
                        date: { gte: minDate, lte: maxDate }
                    },
                    select: { recordId: true }
                })).map(r => r.recordId)
            );

            const newRecords = records.filter(r => !existingIds.has(r.id));
            
            let khChecksAdded = 0;
            let zuCirclesAdded = 0;
            const newZuByChar = new Map<number, number>();

            for (const r of newRecords) {
                const valor = r.params[0] || 0;
                const gold = r.params[1] || 0;
                
                if (valor === 7 && gold === 0) {
                    zuCirclesAdded++;
                    const cid = r.who;
                    newZuByChar.set(cid, (newZuByChar.get(cid) || 0) + 1);
                } 
                else if (valor > 0 && gold > 0) {
                     let isStage = false;
                     if ((valor === 4 && gold === 20) ||
                         (valor === 6 && gold === 30) ||
                         (valor === 10 && gold === 45) ||
                         (valor === 14 && gold === 65) ||
                         (valor === 24 && gold === 90) ||
                         (valor === 40 && gold === 120) ||
                         (valor === 70 && gold === 155)) {
                         isStage = true;
                     }
                     if (isStage) khChecksAdded++;
                }
            }

            const start = new Date(minDate);
            const startDay = start.getDay() || 7;
            start.setDate(start.getDate() - startDay + 1);
            start.setHours(0,0,0,0);
            
            const end = new Date(maxDate);
            const endDay = end.getDay() || 7;
            end.setDate(end.getDate() + (7 - endDay));
            end.setHours(23,59,59,999);

            const dbHistory = await this.prisma.factionHistory.findMany({
                where: {
                    clanId,
                    date: { gte: start, lte: end }
                }
            });

            const members = await this.prisma.character.findMany({ where: { clanId } });
            const charMap = new Map<string, string>();
            members.forEach(m => {
               if(m.gameCharId) charMap.set(String(m.gameCharId), m.id);
            });

            const oldZuCounts = new Map<string, number>();
            for (const r of dbHistory) {
                if (r.param0 === 7 && r.param1 === 0) {
                   const dbId = charMap.get(String(r.characterId));
                   if (dbId) {
                       oldZuCounts.set(dbId, (oldZuCounts.get(dbId) || 0) + 1);
                   }
                }
            }

            let newDancers = 0;
            let finishedDancers = 0;
            const finalZuCounts = new Map<string, number>(oldZuCounts);
            
            for (const r of newRecords) {
                if (r.params[0] === 7 && r.params[1] === 0) {
                    const dbId = charMap.get(String(r.who));
                    if (dbId) {
                        finalZuCounts.set(dbId, (finalZuCounts.get(dbId) || 0) + 1);
                    }
                }
            }

            for (const [gameId, count] of newZuByChar) {
                const dbId = charMap.get(String(gameId));
                if (!dbId) continue;

                const oldC = oldZuCounts.get(dbId) || 0;
                const newC = finalZuCounts.get(dbId) || 0;

                if (oldC === 0 && newC > 0) newDancers++;
                if (oldC < 14 && newC >= 14) finishedDancers++;
            }

            let processedCount = 0;
            const batchSize = 100;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                await this.prisma.$transaction(
                    batch.map(record => 
                        this.prisma.factionHistory.upsert({
                            where: {
                                clanId_recordId: {
                                    clanId: clanId,
                                    recordId: record.id
                                }
                            },
                            create: {
                                clanId: clanId,
                                recordId: record.id,
                                date: record.date,
                                characterId: record.who,
                                action: record.action,
                                description: record.description,
                                param0: record.params[0],
                                param1: record.params[1],
                                param2: record.params[2],
                            },
                            update: {
                                action: record.action,
                                description: record.description,
                            }
                        })
                    )
                );
                processedCount += batch.length;
                task.progress = processedCount;
            }

            await this.processReport(userId, clanId, records);
            
            task.status = 'COMPLETED';
            task.result = {
                total: records.length,
                processed: processedCount,
                khChecksAdded,
                zuCirclesAdded,
                newDancers,
                finishedDancers
            };
        } catch (err: any) {
            console.error(err);
            task.status = 'ERROR';
            task.error = err.message;
        }
    }

    private async processReport(userId: string, clanId: string, records: ParsedFactionRecord[]) {
        if (records.length === 0) return;

        const recordsByWeek = new Map<string, ParsedFactionRecord[]>();
        for (const r of records) {
            const weekIso = getWeekIso(r.date);
            if (!recordsByWeek.has(weekIso)) recordsByWeek.set(weekIso, []);
            recordsByWeek.get(weekIso)?.push(r);
        }

        for (const [weekIso, weekRecords] of recordsByWeek) {
            await this.processWeekReport(userId, clanId, weekIso, weekRecords);
        }
    }

    private async processWeekReport(userId: string, clanId: string, weekIso: string, records: ParsedFactionRecord[]) {
        const [yearStr, weekStr] = weekIso.split('-W');
        const year = parseInt(yearStr, 10);
        const weekNum = parseInt(weekStr, 10);
        
        const simple = new Date(Date.UTC(year, 0, 4));
        const dayOfWeek = simple.getUTCDay() || 7; 
        simple.setUTCDate(simple.getUTCDate() + (weekNum - 1) * 7 - dayOfWeek + 1);
        const startOfWeek = simple;
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        endOfWeek.setMilliseconds(-1);

        let context = await this.prisma.clanWeeklyContext.findUnique({
            where: { clanId_weekIso: { clanId, weekIso } },
            include: { clanHall: true }
        });

        if (!context) {
            context = await this.prisma.clanWeeklyContext.create({
                data: {
                    clanId,
                    weekIso,
                    weekNumber: weekNum,
                    dateStart: startOfWeek,
                    dateEnd: endOfWeek,
                    clanHall: { create: {} }
                },
                include: { clanHall: true }
            });
        }
        
        if (!context.clanHall) {
             context.clanHall = await this.prisma.clanHall.create({ data: { contextId: context.id } });
        }

        const members = await this.prisma.character.findMany({ where: { clanId } });
        const charMap = new Map<string, string>();
        members.forEach(m => {
            if(m.gameCharId) charMap.set(String(m.gameCharId), m.id);
        });

        const rhythmMap = new Map<string, number>();
        const zuMap = new Map<string, number>();
        const khUpdates = new Map<string, Map<number, { valor: number, gold: number, ts: number }>>();
        // charId -> timestamp -> aggregated pair
        const combinedByCharTs = new Map<string, Map<number, { valor: number, gold: number }>>();

        // 1) Сначала сгруппируем по персонажу и времени: valor и gold могут быть в разных записях
        for (const r of records) {
            const charId = charMap.get(String(r.who));
            if (!charId) continue;

            const ts = r.timestamp; // секунда точности из файла истории
            if (!combinedByCharTs.has(charId)) combinedByCharTs.set(charId, new Map());
            const tsMap = combinedByCharTs.get(charId)!;
            if (!tsMap.has(ts)) tsMap.set(ts, { valor: 0, gold: 0 });
            const agg = tsMap.get(ts)!;

            // type: 1 — вклад доблести, 2 — вклад золота (см. parser)
            if (r.type === 1) {
                agg.valor += (r.params[0] || 0);
            } else if (r.type === 2) {
                agg.gold += (r.params[0] || 0);
            }
        }

        // 2) Классифицируем уже объединённые пары, как это было раньше
        for (const [charId, tsMap] of combinedByCharTs) {
            for (const [ts, data] of tsMap) {
                const valor = data.valor || 0;
                const gold = data.gold || 0;
                // ZU (запретные знания): ровно 7 доблести без золота
                if (valor === 7 && gold === 0) {
                    zuMap.set(charId, (zuMap.get(charId) || 0) + 7);
                    continue;
                }

                // Ритм: 2/4/8 доблести без золота
                if (gold === 0 && (valor === 2 || valor === 4 || valor === 8)) {
                    rhythmMap.set(charId, (rhythmMap.get(charId) || 0) + valor);
                    continue;
                }

                // Прогресс зала клана — только если есть и доблесть, и золото
                if (valor > 0 && gold > 0) {
                    let stage = 0;
                    if (valor === 4 && gold === 20) stage = 1;
                    else if (valor === 6 && gold === 30) stage = 2;
                    else if (valor === 10 && gold === 45) stage = 3;
                    else if (valor === 14 && gold === 65) stage = 4;
                    else if (valor === 24 && gold === 90) stage = 5;
                    else if (valor === 40 && gold === 120) stage = 6;
                    else if (valor === 70 && gold === 155) stage = 7;

                    if (stage > 0) {
                        if (!khUpdates.has(charId)) khUpdates.set(charId, new Map());
                        const sMap = khUpdates.get(charId)!;
                        const prev = sMap.get(stage);
                        // сохраняем самый ранний ts для стадии в пределах недели
                        if (!prev || ts < prev.ts) {
                            sMap.set(stage, { valor, gold, ts });
                        }
                    }
                }
            }
        }

        for (const [charId, val] of rhythmMap) {
            await this.prisma.rhythm.upsert({
                where: { contextId_characterId: { contextId: context.id, characterId: charId } },
                create: { contextId: context.id, characterId: charId, valor: val },
                update: { valor: { increment: val } }
            });
        }

        for (const [charId, val] of zuMap) {
             await this.prisma.forbiddenKnowledge.upsert({
                where: { contextId_characterId: { contextId: context.id, characterId: charId } },
                create: { contextId: context.id, characterId: charId, valor: val },
                update: { valor: { increment: val } }
             });
        }
        
        for (const [charId, sMap] of khUpdates) {
            for (const [stage, data] of sMap) {
                const createdAt = new Date(data.ts * 1000);
                await (this.prisma.clanHallProgress as any).upsert({
                    where: { 
                        clanHallId_characterId_stage_createdAt: { 
                            clanHallId: context.clanHall!.id, 
                            characterId: charId, 
                            stage,
                            createdAt
                        } 
                    } as any,
                    create: {
                        clanHallId: context.clanHall!.id,
                        characterId: charId,
                        stage,
                        valor: data.valor,
                        gold: data.gold,
                        createdAt
                    },
                    update: {
                        valor: data.valor,
                        gold: data.gold
                    }
                });
            }
        }
    }

    async updateWeeklyStats(clanId: string, week: string, dto: UpdateWeeklyStatsDto) {
        let context = await this.prisma.clanWeeklyContext.findUnique({
             where: { clanId_weekIso: { clanId, weekIso: week } },
             include: { clanHall: true }
        });

        if (!context) {
             const [yearStr, weekStr] = week.split('-W');
             const year = parseInt(yearStr, 10);
             const weekNum = parseInt(weekStr, 10);
             
             const simple = new Date(Date.UTC(year, 0, 4));
             const dayOfWeek = simple.getUTCDay() || 7; 
             simple.setUTCDate(simple.getUTCDate() + (weekNum - 1) * 7 - dayOfWeek + 1);
             const startOfWeek = simple;
             const endOfWeek = new Date(startOfWeek);
             endOfWeek.setDate(endOfWeek.getDate() + 7);
             endOfWeek.setMilliseconds(-1);

             context = await this.prisma.clanWeeklyContext.create({
                 data: {
                     clanId,
                     weekIso: week,
                     weekNumber: weekNum,
                     dateStart: startOfWeek,
                     dateEnd: endOfWeek,
                     clanHall: { create: {} }
                 },
                 include: { clanHall: true }
             });
        }
        
        if (!context.clanHall) {
             context.clanHall = await this.prisma.clanHall.create({ data: { contextId: context.id } });
        }

        const { characterId, khRecords, rhythmValor, zuCircles } = dto;
        const contextId = context.id;

        await this.prisma.$transaction(async (tx) => {
             if (khRecords !== undefined) {
                 const clanHall = await tx.clanHall.findUnique({ where: { contextId } });
                 if (clanHall) {
                     const existing = await tx.clanHallProgress.findMany({
                         where: {
                             clanHallId: clanHall.id,
                             characterId
                         }
                     });
                     
                     const newStagesKeys = new Set(khRecords.map(r => {
                         const targetDate = new Date(context.dateStart);
                         targetDate.setUTCDate(targetDate.getUTCDate() + r.dayIndex);
                         return `${r.stage}_${targetDate.toISOString()}`;
                     }));
                    
                     const toDelete = existing.filter(e => !newStagesKeys.has(`${e.stage}_${e.createdAt.toISOString()}`));
                     if (toDelete.length > 0) {
                         await tx.clanHallProgress.deleteMany({
                             where: { id: { in: toDelete.map(e => e.id) } }
                         });
                     }
                    
                     for (const record of khRecords) {
                         const targetDate = new Date(context.dateStart);
                         targetDate.setUTCDate(targetDate.getUTCDate() + record.dayIndex);
                        
                         const vals = this.getKhStageValues(record.stage);
                         await (tx.clanHallProgress as any).upsert({
                             where: { 
                                 clanHallId_characterId_stage_createdAt: { 
                                     clanHallId: clanHall.id, 
                                     characterId, 
                                     stage: record.stage,
                                     createdAt: targetDate
                                 } 
                             } as any,
                             create: {
                                 clanHallId: clanHall.id,
                                 characterId,
                                 stage: record.stage,
                                 valor: vals.valor,
                                 gold: vals.gold,
                                 createdAt: targetDate
                             },
                             update: {
                                 valor: vals.valor,
                                 gold: vals.gold
                             }
                         });
                     }
                 }
             }

             if (rhythmValor !== undefined) {
                 await tx.rhythm.upsert({
                     where: { contextId_characterId: { contextId, characterId } },
                     create: {
                         contextId,
                         characterId,
                         valor: rhythmValor
                     },
                     update: { valor: rhythmValor }
                 });
             }

             if (zuCircles !== undefined) {
                 const valor = zuCircles * 7;
                 await tx.forbiddenKnowledge.upsert({
                     where: { contextId_characterId: { contextId, characterId } },
                     create: {
                         contextId,
                         characterId,
                         valor
                     },
                     update: { valor }
                 });
             }
        });
        
        return this.getWeeklySummary(clanId, week);
    }

    private getKhStageValues(stage: number) {
        switch (stage) {
            case 1: return { valor: 4, gold: 20 };
            case 2: return { valor: 6, gold: 30 };
            case 3: return { valor: 10, gold: 45 };
            case 4: return { valor: 14, gold: 65 };
            case 5: return { valor: 24, gold: 90 };
            case 6: return { valor: 40, gold: 120 };
            case 7: return { valor: 70, gold: 155 };
            default: return { valor: 0, gold: 0 };
        }
    }

    async getWeeklySummary(clanId: string, week: string) {
        const context = await this.prisma.clanWeeklyContext.findUnique({
            where: { clanId_weekIso: { clanId, weekIso: week } },
            include: {
                rhythmRecords: true,
                forbiddenKnowledgeRecords: true,
                clanHall: {
                    include: { progress: true }
                },
                events: {
                    include: { participants: true }
                }
            }
        });
    
        const clan = await this.prisma.clan.findUnique({
            where: { id: clanId },
            include: { members: true }
        });
        if (!clan) throw new NotFoundException('Clan not found');

        // Pre-calculate global clan hall stats
        const fullStageCloses = new Map<number, Date>();

        if (context?.clanHall?.progress) {
            const allProgress = context.clanHall.progress;
            for (let i = 1; i <= 6; i++) {
                const times: number[] = [];

                // 120th record
                const stageRecords = allProgress
                    .filter(p => p.stage === i)
                    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                if (stageRecords.length >= 120) {
                    times.push(stageRecords[119].createdAt.getTime());
                }

                // Any higher stage
                const higherStageRecords = allProgress
                    .filter(p => p.stage > i)
                    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                if (higherStageRecords.length > 0) {
                    times.push(higherStageRecords[0].createdAt.getTime());
                }

                if (times.length > 0) {
                    fullStageCloses.set(i, new Date(Math.min(...times)));
                }
            }
        }
    
        const stats = clan.members.map((m: any) => {
            const rhythm = context?.rhythmRecords.find(r => r.characterId === m.id);
            const zu = context?.forbiddenKnowledgeRecords.find(r => r.characterId === m.id);
            const khProgress = (context?.clanHall?.progress.filter(p => p.characterId === m.id) || [])
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            
            const attendedStages = new Set<string>();
            const history = khProgress.map(p => ({stage: p.stage, date: p.createdAt.toISOString()}));

            if (context?.clanHall && context.dateStart && context.dateEnd) {
                const start = new Date(context.dateStart);
                const end = new Date(context.dateEnd);
                
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    
                    // For historical summary, we need to know what stage was active at various points of that day
                    // Since it's a "summary", we check if ANY contribution of the member on that day 
                    // matched the active stage at the moment of contribution.
                    
                    const dailyProgress = khProgress.filter(p => p.createdAt.toISOString().split('T')[0] === dateStr);
                    
                    // To be fair, for each stage visited this day, we check if the FIRST visit to that stage 
                    // was when it was the active stage.
                    const stagesVisitedThisDay = [...new Set(dailyProgress.map(p => p.stage))];
                    
                    let attendedActiveStage = false;
                    for (const stage of stagesVisitedThisDay) {
                        const firstVisit = dailyProgress.find(p => p.stage === stage);
                        if (!firstVisit) continue;

                        const contributionTime = firstVisit.createdAt.getTime();
                        let activeStageAtTime = 1;
                        for (let s = 1; s <= 6; s++) {
                            const closeTime = fullStageCloses.get(s);
                            if (closeTime && closeTime.getTime() < contributionTime) {
                                activeStageAtTime = s + 1;
                            }
                        }
                        if (stage === activeStageAtTime) {
                            attendedActiveStage = true;
                            break;
                        }
                    }

                    if (attendedActiveStage) {
                        attendedStages.add(dateStr);
                    }
                }
            }
    
            const rVal = rhythm?.valor || 0;
            const zVal = zu?.valor || 0;
            const khVal = khProgress.reduce((acc, p) => acc + p.valor, 0);
            const zuCircles = Math.floor(zVal / 7);
    
            return {
                characterId: m.id,
                name: m.name,
                class: m.class,
                khAttendedDates: Array.from(attendedStages),
                khHistory: history,
                rhythmValor: rVal,
                zuCircles,
                zuValor: zVal,
                khValor: khVal,
                totalValor: rVal + zVal + khVal
            };
        });
        
        stats.sort((a, b) => {
            if (b.totalValor !== a.totalValor) return b.totalValor - a.totalValor;
            return (a.name || '').localeCompare(b.name || '');
        });
        
        return stats;
      }
}
