import {BadRequestException, Injectable, NotFoundException} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {CreateCharacterDto} from './dto/create-character.dto';
import {ClanPermission} from '../common/constants/permissions';

function getWeekIso(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) {
    }

    async findByUsername(username: string) {
        return this.prisma.user.findFirst({where: {username}});
    }

    async create(data: any) {
        // Проверяем, существует ли уже пользователь
        const existing = await this.findByUsername(data.name);
        if (existing) {
            throw new BadRequestException('Пользователь с таким name уже существует');
        }
        return this.prisma.user.create({data});
    }

    async findOrCreate(payload: any) {
        const {id, email, name, preferred_username} = payload;
        // Primary source of username should be the specific claim URI
        const claimUsername = payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'];

        const existing = await this.prisma.user.findUnique({
            where: {id},
            include: {
                characters: {orderBy: {name: 'asc'}},
                notificationSettings: true
            },
        });
        if (existing) return existing;

        let username = claimUsername || name || preferred_username || email?.split('@')[0] || `User_${id.slice(-6)}`;

        try {
            return await this.prisma.user.create({
                data: {
                    id,
                    username,
                    notificationSettings: {
                        create: {}
                    }
                },
                include: {
                    characters: {orderBy: {name: 'asc'}},
                    notificationSettings: true
                },
            });
        } catch (e) {
            // Handle unique constraint violation (likely username)
            const newUsername = `${username}_${Math.floor(Math.random() * 10000)}`;
            return await this.prisma.user.create({
                data: {
                    id,
                    username: newUsername,
                    notificationSettings: {
                        create: {}
                    }
                },
                include: {
                    characters: {orderBy: {name: 'asc'}},
                    notificationSettings: true
                },
            });
        }
    }

    async generateOtp(userId: string) {
        const otp = Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        return this.prisma.user.update({
            where: { id: userId },
            data: {
                otpCode: otp,
                otpExpiresAt: expiresAt,
            },
            select: {
                otpCode: true,
                otpExpiresAt: true,
            },
        });
    }

    async updateNotificationSettings(userId: string, dto: any) {
        return this.prisma.notificationSettings.update({
            where: { userId },
            data: dto,
        });
    }

    async getPublicCharacter(id: string) {
        const char = await this.prisma.character.findFirst({
            where: {
                OR: [
                    {id},
                    {shortId: id}
                ]
            },
            include: {clan: true}
        });
        if (!char) throw new NotFoundException('Персонаж не найден');
        return char;
    }

    async getCurrentUser(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: {id: userId},
            include: {
                characters: true,
                notificationSettings: true
            },
        });
        if (!user) throw new NotFoundException('Пользователь не найден');
        return user;
    }

    private generateShortId(): string {
        return Math.random().toString(36).substring(2, 8);
    }

    async createCharacter(userId: string, dto: CreateCharacterDto) {
        const gameCharId = this.extractGameCharId(dto.pwobsLink);
        return this.prisma.character.create({
            data: {
                ...dto,
                gameCharId,
                userId,
                shortId: this.generateShortId(),
            },
        });
    }

    async updateCharacter(userId: string, characterId: string, dto: any) {
        const char = await this.prisma.character.findUnique({
            where: {id: characterId},
        });

        if (!char || char.userId !== userId) {
            throw new NotFoundException('Персонаж не найден или не принадлежит вам');
        }

        if (dto.pwobsLink) {
            dto.gameCharId = this.extractGameCharId(dto.pwobsLink);
        }

        return this.prisma.character.update({
            where: {id: characterId},
            data: dto,
        });
    }

    private extractGameCharId(link: string): string {
        const match = link.match(/pwobs\.com\/[^/]+\/players\/([^/?]+)/);
        return match ? match[1] : '';
    }

    async switchActiveCharacter(userId: string, characterId: string) {
        const char = await this.prisma.character.findUnique({
            where: {id: characterId},
        });
        if (!char || char.userId !== userId) {
            throw new NotFoundException('Персонаж не найден или не принадлежит вам');
        }

        return this.prisma.user.update({
            where: {id: userId},
            data: {mainCharacterId: characterId},
            include: {characters: true},
        });
    }

    async getMyClan(userId: string, weekIso?: string) {
        const user = await this.prisma.user.findUnique({where: {id: userId}});
        if (!user || !user.mainCharacterId) {
            throw new NotFoundException('Активный персонаж не выбран');
        }

        const char = await this.prisma.character.findUnique({
            where: {id: user.mainCharacterId},
            include: {clan: true},
        });

        if (!char || !char.clan) {
            throw new NotFoundException('Персонаж не состоит в клане');
        }

        const targetWeekIso = weekIso || getWeekIso(new Date());

        const context = await this.prisma.clanWeeklyContext.findUnique({
            where: {clanId_weekIso: {clanId: char.clan.id, weekIso: targetWeekIso}},
            include: {
                rhythmRecords: true,
                forbiddenKnowledgeRecords: true,
                clanHall: {
                    include: {progress: true}
                }
            }
        });

        let totalValor = 0;
        if (context) {
            const rhythmValor = context.rhythmRecords.reduce((acc, r) => acc + r.valor, 0);
            const knowledgeValor = context.forbiddenKnowledgeRecords.reduce((acc, r) => acc + r.valor, 0);
            const clanHallValor = context.clanHall?.progress.reduce((acc, r) => acc + r.valor, 0) || 0;
            totalValor = rhythmValor + knowledgeValor + clanHallValor;
        }

        return {
            ...char.clan,
            weekIso: targetWeekIso,
            totalValor
        };
    }

    async getMyActivity(userId: string, weekIso?: string) {
        const user = await this.prisma.user.findUnique({where: {id: userId}});
        if (!user || !user.mainCharacterId) throw new BadRequestException('No character selected');
        const charId = user.mainCharacterId;

        const char = await this.prisma.character.findUnique({
            where: {id: charId},
            include: {clan: true}
        });
        if (!char) throw new NotFoundException('Character not found');

        if (!char.clan) throw new BadRequestException(
            'Character is not in a clan. Please switch to a character in a clan.'
        )

        const now = new Date();
        const targetWeekIso = weekIso || getWeekIso(now);

        const context = await this.prisma.clanWeeklyContext.findUnique({
            where: {
                clanId_weekIso: {clanId: char.clan.id, weekIso: targetWeekIso},
            },
            include: {
                rhythmRecords: true,
                forbiddenKnowledgeRecords: true,
                clanHall: {
                    include: {progress: true}
                },
                events: {
                    where: {date: {gte: now}},
                    include: {
                        participants: true,
                        squads: true
                    }
                }
            }
        });

        const response: any = {characterId: char.id, events: context?.events || []};

        // Rhythm
        const rhythm = context.rhythmRecords.find(r => r.characterId === charId);
        response.rhythm = {
            status: rhythm && rhythm.valor > 0 ? 'COMPLETED' : 'NONE',
            valor: rhythm?.valor || 0,
        };

        // Forbidden knowledge
        const zu = context?.forbiddenKnowledgeRecords.find(r => r.characterId === charId);
        response.forbiddenKnowledge = {
            circles: zu && zu.valor > 0 ? zu.valor / 7 : 0,
            valor: zu?.valor || 0
        };

        // Clan Hall
        if (context?.clanHall) {
            const myProgress = context.clanHall.progress.filter(p => p.characterId === charId);

            const stageCounts = new Map<number, number>();
            context.clanHall.progress.forEach(p => {
                stageCounts.set(p.stage, (stageCounts.get(p.stage) || 0) + 1);
            });
            const stageCloses = new Map<number, Date>();
            let attendedStages = [];
            const dailyStagesMap = new Map<string, number>();

            let availableStage = 0;
            for (let i = 1; i <= 7; i++) {
                if ((stageCounts.get(i) || 0) > 0) availableStage = i;
                if ((stageCounts.get(i) || 0) >= 120) {
                    const stageRecords = context.clanHall.progress
                        .filter(p => p.stage === i)
                        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                    stageCloses.set(i, stageRecords[119].createdAt);
                }
                const currentDate = new Date(context.dateStart);
                const endDate = new Date(context.dateEnd);

                while (currentDate <= endDate) {
                    let maxStage = 0;
                    for (let stage = 1; stage <= 7; stage++) {
                        if (stageCloses.has(stage) && stageCloses.get(stage) <= currentDate) {
                            maxStage = stage;
                        }
                    }

                    const dateStr = currentDate.toISOString().split('T')[0];
                    dailyStagesMap.set(dateStr, maxStage);

                    // Проверяем историю прогресса для текущей даты
                    const todayAttended = myProgress.some(p =>
                        p.createdAt.toISOString().split('T')[0] === dateStr &&
                        p.stage === maxStage
                    );

                    if (todayAttended) {
                        attendedStages.push(dateStr);
                    }

                    currentDate.setDate(currentDate.getDate() + 1);
                }
            }

            availableStage = availableStage == 0 ? 1 : availableStage;
            response.clanHall = {
                availableStage,
                stageCounts: Object.fromEntries(stageCounts),
                stageCloses: Object.fromEntries(stageCloses),
                dailyStagesMap: Object.fromEntries(dailyStagesMap),
                attendedStages,
                history: myProgress.map(p => ({stage: p.stage, date: p.createdAt.toISOString()})),
                nextStage: Math.min(availableStage + 1, 7)
            };
        } else {

            response.clanHall = {
                availableStage: 1,
                stageCounts: {},
                stageCloses: {},
                dailyStagesMap: {},
                attendedStages: [],
                history: [],
                nextStage: 2
            };

        }

        return response;
    }

    async getMyPermissions(userId: string): Promise<string[]> {
        const user = await this.prisma.user.findUnique({
            where: {id: userId},
        });

        if (!user || !user.mainCharacterId) {
            return [];
        }

        const character = await this.prisma.character.findUnique({
            where: {id: user.mainCharacterId},
            include: {clan: true},
        });

        if (!character || !character.clan || !character.clanRole) {
            return [];
        }

        if (character.clanRole === 'MASTER') {
            return Object.values(ClanPermission);
        }

        const settings = character.clan.settings as any;
        if (!settings.rolePermissions) {
            return [];
        }

        const rolePerms = settings.rolePermissions.find((rp: any) => rp.role === character.clanRole);
        return rolePerms ? rolePerms.permissions : [];
    }

    async resolveCharacterNames(ids: string[]): Promise<Record<string, { name: string; class: string }>> {
        if (!ids || ids.length === 0) return {};

        const chars = await this.prisma.character.findMany({
            where: {id: {in: ids}},
            select: {id: true, name: true, class: true},
        });

        return chars.reduce((acc, c) => {
            acc[c.id] = {name: c.name, class: c.class};
            return acc;
        }, {} as Record<string, { name: string; class: string }>);
    }
}
