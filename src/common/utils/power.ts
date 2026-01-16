export const FightingScoreOccupationFactor: Record<string, number> = {
    'Воин': 1.0,
    'Маг': 1.0,
    'Стрелок': 1.0,
    'Оборотень': 1.0,
    'Друид': 1.0,
    'Странник': 1.0,
    'Лучник': 1.0,
    'Жрец': 1.0,
    'Паладин': 1.0,
    'Убийца': 1.0,
    'Шаман': 1.0,
    'Бард': 1.0,
    'Страж': 1.0,
    'Мистик': 1.0,
    'Дух крови': 1.0,
    'Призрак': 1.0,
    'Жнец': 1.0
};

export const PropertyScoreFactor = [0.0, 0.0, 0.0, 0.0];

export interface PowerBreakdown {
    total: number;
    isPhysical: boolean;
    baseAvgDamage: number;
    attackRate: number;
    multipliers: {
        crit: number;
        attackLevel: number;
        spirit: number;
        penetration: number;
        class: number;
        castSpeed?: number;
    };
    rawDps: number;
}

export function calculatePowerDetails(c: any): PowerBreakdown {
    if (!c) return {
        total: 0, isPhysical: true, baseAvgDamage: 0, attackRate: 0, rawDps: 0,
        multipliers: {crit: 0, attackLevel: 0, spirit: 0, penetration: 0, class: 0}
    };

    const attackRate = c.atkPerSec || 1.0;
    let praySpeed = c.chanting || 0;
    if (praySpeed > 99) praySpeed = 99;

    const critRate = (c.critChance || 0) * 0.01;
    const critDamageMultiplier = (c.critDamage || 200) * 0.01;
    const critFactor = (1.0 - critRate + critRate * critDamageMultiplier);

    const vigour = c.spirit || 0;
    const vigourFactor = (1.0 + vigour / 4000.0);

    const atkLvlFactor = (1.0 + (c.attackLevel || 0) / 100.0);

    const levelBonusFactor = (1.0 + (c.levelBonus || 0) / 10000.0);

    const physPenFactor = (1.0 + 3.0 * (c.physPenetration || 0) / ((c.physPenetration || 0) + 300.0));
    const basePhysAvg = ((c.minAttack || 0) + (c.maxAttack || 0)) * 0.5;

    const physicalDps =
        basePhysAvg *
        critFactor *
        atkLvlFactor *
        vigourFactor *
        physPenFactor *
        levelBonusFactor *
        attackRate;

    const castSpeedFactor = (2.0 / (2.0 - praySpeed / 100.0));
    const magPenFactor = (1.0 + 3.0 * (c.magPenetration || 0) / ((c.magPenetration || 0) + 300.0));
    const baseMagAvg = basePhysAvg;

    const magicalDps =
        baseMagAvg *
        critFactor *
        atkLvlFactor *
        vigourFactor *
        magPenFactor *
        levelBonusFactor *
        castSpeedFactor;

    const isPhysical = physicalDps >= magicalDps;
    const clsFactor = FightingScoreOccupationFactor[c.class] || 1.0;
    const fighting = Math.max(physicalDps, magicalDps) * clsFactor;

    let fightingScore = 0;
    if (PropertyScoreFactor.every(x => x === 0)) {
        fightingScore = Math.round(fighting);
    } else {
        fightingScore =
            PropertyScoreFactor[0] * Math.exp(PropertyScoreFactor[1] * fighting) +
            PropertyScoreFactor[2] * Math.exp(PropertyScoreFactor[3] * fighting);
        fightingScore = Math.round(fightingScore);
    }

    return {
        total: fightingScore,
        isPhysical,
        baseAvgDamage: isPhysical ? basePhysAvg : baseMagAvg,
        attackRate: isPhysical ? attackRate : 1.0,
        rawDps: fighting,
        multipliers: {
            crit: critFactor,
            attackLevel: atkLvlFactor,
            spirit: vigourFactor,
            penetration: isPhysical ? physPenFactor : magPenFactor,
            class: clsFactor,
            castSpeed: isPhysical ? undefined : castSpeedFactor
        }
    };
}
