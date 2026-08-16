import { GameItem } from '../types';
import { getGameItems } from './gameConfigStore';

// ============================================================================
// WarEra Combat Unit Optimizer — data & kalkulasi
// Semua tabel skill bersumber dari gameConfig.getGameConfig (v0.25.x).
// Model damage terverifikasi dengan profil live (user.getUserLite):
//   attack.total = (skillAttack + weaponAttack + precisionOverflow*4)
//                  * (1 + ammo%) * (1 + buffs%) * (1 + rank%)
//   precision cap 100 (overflow -> attack x4), critChance cap 60 (overflow -> critDmg x4)
// ============================================================================

export type CombatSkillKey =
  | 'attack'
  | 'precision'
  | 'criticalChance'
  | 'criticalDamages'
  | 'armor'
  | 'dodge'
  | 'health'
  | 'hunger'
  | 'lootChance';

export interface SkillDef {
  key: CombatSkillKey;
  name: string;
  desc: string;
  group: 'damage' | 'defense' | 'sustain';
  base: number;
  perLevel: number;
  unlockAtLevel: number;
  cap?: number;
  overflowTo?: CombatSkillKey;
  overflowValue?: number;
}

export const COMBAT_SKILLS: SkillDef[] = [
  { key: 'attack', name: 'Attack', group: 'damage', desc: '+25 dmg/level', base: 100, perLevel: 25, unlockAtLevel: 1 },
  { key: 'precision', name: 'Precision', group: 'damage', desc: '+5% hit/level (cap 100%)', base: 50, perLevel: 5, unlockAtLevel: 1, cap: 100, overflowTo: 'attack', overflowValue: 4 },
  { key: 'criticalChance', name: 'Crit Chance', group: 'damage', desc: '+5% crit/level (cap 60%)', base: 10, perLevel: 5, unlockAtLevel: 5, cap: 60, overflowTo: 'criticalDamages', overflowValue: 4 },
  { key: 'criticalDamages', name: 'Crit Damage', group: 'damage', desc: '+20% crit dmg/level', base: 100, perLevel: 20, unlockAtLevel: 10 },
  { key: 'armor', name: 'Armor', group: 'defense', desc: '+6 armor/level (soft-cap 40)', base: 0, perLevel: 6, unlockAtLevel: 5 },
  { key: 'dodge', name: 'Dodge', group: 'defense', desc: '+4 dodge/level (soft-cap 40)', base: 0, perLevel: 4, unlockAtLevel: 10 },
  { key: 'health', name: 'Health', group: 'sustain', desc: '+10 max HP/level', base: 100, perLevel: 10, unlockAtLevel: 5 },
  { key: 'hunger', name: 'Hunger', group: 'sustain', desc: '+1 slot makanan/level', base: 4, perLevel: 1, unlockAtLevel: 10 },
  { key: 'lootChance', name: 'Loot Chance', group: 'sustain', desc: '+2% loot/level', base: 5, perLevel: 2, unlockAtLevel: 1 },
];

export const SKILL_MAP = Object.fromEntries(
  COMBAT_SKILLS.map((s) => [s.key, s])
) as Record<CombatSkillKey, SkillDef>;

export const MAX_SKILL_LEVEL = 10;
export const DEFAULT_POINTS_PER_LEVEL = 4;

// Biaya poin: level ke-N butuh N poin. Total menuju level L = L*(L+1)/2.
// (Terverifikasi: profil level 45 -> totalSkillPoints 180 = 45*4,
//  spentSkillPoints 178 = Σ L(L+1)/2.)
export function skillPointCost(nextLevel: number): number {
  return Math.max(1, Math.round(nextLevel));
}
export function skillTotalCost(level: number): number {
  const lv = clampLevel(level);
  return (lv * (lv + 1)) / 2;
}
export function clampLevel(v: number): number {
  return Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.round(v || 0)));
}
export function skillValue(def: SkillDef, level: number): number {
  return def.base + def.perLevel * clampLevel(level);
}

// ============================================================================
// Gear
// ============================================================================

export type GearSlot =
  | 'weapon'
  | 'helmet'
  | 'chest'
  | 'pants'
  | 'boots'
  | 'gloves'
  | 'ammo'
  | 'food'
  | 'pill';

export type GearStatKey =
  | 'attack'
  | 'criticalChance'
  | 'criticalDamages'
  | 'armor'
  | 'dodge'
  | 'precision'
  | 'percentAttack'
  | 'healthRegenPercent';

export const STAT_LABELS: Record<GearStatKey, string> = {
  attack: 'Attack',
  criticalChance: 'Crit Chance',
  criticalDamages: 'Crit Dmg',
  armor: 'Armor',
  dodge: 'Dodge',
  precision: 'Precision',
  percentAttack: 'Attack %',
  healthRegenPercent: 'Heal %',
};

export interface GearPiece {
  code: string;
  name: string;
  slot: GearSlot;
  rarity: string;
  stats: Partial<Record<GearStatKey, number>>;
  ranges?: Partial<Record<GearStatKey, [number, number]>>;
  price: number;
  priceSource: 'market' | 'estimate';
  wear: number;
  healPercent?: number;
  buffPercent?: number;
}

export interface UnitGear {
  weapon?: GearPiece;
  helmet?: GearPiece;
  chest?: GearPiece;
  pants?: GearPiece;
  boots?: GearPiece;
  gloves?: GearPiece;
  ammo?: GearPiece;
  food?: GearPiece;
  pill?: GearPiece;
}

export const GEAR_SLOTS: { slot: GearSlot; label: string; itemCodes: string[] }[] = [
  { slot: 'weapon', label: 'Senjata', itemCodes: ['knife', 'gun', 'rifle', 'sniper', 'tank', 'jet'] },
  { slot: 'helmet', label: 'Helm', itemCodes: ['helmet1', 'helmet2', 'helmet3', 'helmet4', 'helmet5', 'helmet6'] },
  { slot: 'chest', label: 'Rompi', itemCodes: ['chest1', 'chest2', 'chest3', 'chest4', 'chest5', 'chest6'] },
  { slot: 'pants', label: 'Celana', itemCodes: ['pants1', 'pants2', 'pants3', 'pants4', 'pants5', 'pants6'] },
  { slot: 'boots', label: 'Sepatu', itemCodes: ['boots1', 'boots2', 'boots3', 'boots4', 'boots5', 'boots6'] },
  { slot: 'gloves', label: 'Sarung Tangan', itemCodes: ['gloves1', 'gloves2', 'gloves3', 'gloves4', 'gloves5', 'gloves6'] },
  { slot: 'ammo', label: 'Amunisi', itemCodes: ['lightAmmo', 'ammo', 'heavyAmmo'] },
  { slot: 'food', label: 'Makanan', itemCodes: ['bread', 'steak', 'cookedFish'] },
  { slot: 'pill', label: 'Obat (Buff)', itemCodes: ['cocain'] },
];

export const SLOT_LABEL: Record<GearSlot, string> = Object.fromEntries(
  GEAR_SLOTS.map((s) => [s.slot, s.label])
) as Record<GearSlot, string>;

// Estimasi harga gear (tidak dijual di Item Markt, jadi tidak ada harga pasar).
// Harga bisa diedit manual di UI.
const RARITY_PRICE: Record<string, number> = {
  common: 18,
  uncommon: 50,
  rare: 130,
  epic: 320,
  legendary: 780,
  mythic: 1900,
};
const WEAPON_PRICE: Record<string, number> = {
  knife: 25,
  gun: 75,
  rifle: 210,
  sniper: 520,
  tank: 1200,
  jet: 3200,
};
export const CONSUMABLE_ESTIMATES: Record<string, number> = {
  lightAmmo: 0.2,
  ammo: 0.7,
  heavyAmmo: 2.7,
  bread: 1.8,
  steak: 3.7,
  cookedFish: 7.5,
  cocain: 36,
};

function gearSlotOfItem(item: GameItem): GearSlot | null {
  if (item.usage === 'weapon') return 'weapon';
  if (['helmet', 'chest', 'pants', 'boots', 'gloves'].includes(item.usage ?? '')) {
    return item.usage as GearSlot;
  }
  if (item.code.toLowerCase() === 'cocain') return 'pill';
  if (item.flatStats?.healthRegenPercent) return 'food';
  if (item.flatStats?.percentAttack) return 'ammo';
  return null;
}

export function makeGearPiece(
  item: GameItem,
  marketPrices?: Record<string, number> | null,
  overrideStats?: Partial<Record<GearStatKey, number>>,
  overridePrice?: number
): GearPiece {
  const slot = gearSlotOfItem(item) ?? 'ammo';
  const stats: Partial<Record<GearStatKey, number>> = {};
  const ranges: Partial<Record<GearStatKey, [number, number]>> = {};

  if (item.dynamicStats) {
    (Object.entries(item.dynamicStats) as [GearStatKey, [number, number]][]).forEach(([k, range]) => {
      ranges[k] = range;
      stats[k] = Math.round((range[0] + range[1]) / 2);
    });
  }
  if (item.flatStats) {
    Object.entries(item.flatStats).forEach(([k, v]) => {
      if (k === 'percentAttack' || k === 'healthRegenPercent') stats[k as GearStatKey] = v;
    });
  }
  if (overrideStats) Object.assign(stats, overrideStats);

  let price: number;
  let priceSource: 'market' | 'estimate' = 'estimate';
  const mkt = marketPrices?.[item.code] ?? marketPrices?.[item.code.toLowerCase()];
  if (typeof mkt === 'number' && mkt > 0) {
    price = mkt;
    priceSource = 'market';
  } else {
    price =
      overridePrice ??
      (slot === 'weapon'
        ? WEAPON_PRICE[item.code] ?? RARITY_PRICE[item.rarity] ?? 100
        : slot === 'ammo' || slot === 'food' || slot === 'pill'
          ? CONSUMABLE_ESTIMATES[item.code] ?? 1
          : RARITY_PRICE[item.rarity] ?? 100);
  }

  const piece: GearPiece = {
    code: item.code,
    name: item.name,
    slot,
    rarity: item.rarity,
    stats,
    ranges,
    price,
    priceSource,
    wear: slot === 'weapon' ? 2 : slot === 'ammo' || slot === 'food' || slot === 'pill' ? 0 : 1,
  };
  if (slot === 'food') piece.healPercent = stats.healthRegenPercent;
  if (slot === 'pill') piece.buffPercent = stats.percentAttack;
  return piece;
}

export function buildGearOptions(
  marketPrices: Record<string, number> | null
): Record<GearSlot, GearPiece[]> {
  const items = getGameItems();
  const result = {
    weapon: [],
    helmet: [],
    chest: [],
    pants: [],
    boots: [],
    gloves: [],
    ammo: [],
    food: [],
    pill: [],
  } as Record<GearSlot, GearPiece[]>;

  for (const { slot, itemCodes } of GEAR_SLOTS) {
    for (const code of itemCodes) {
      const item = items[code] || items[code.toLowerCase()];
      if (!item) continue;
      result[slot].push(makeGearPiece(item, marketPrices));
    }
  }
  return result;
}

// ============================================================================
// Model Combat
// ============================================================================

export interface CombatSettings {
  militaryRankPercent: number; // bonus % damage dari rank militer
  ammoPerHit: number;          // konsumsi amunisi per serangan (1)
  wearMultiplier: number;      // pengali keausan gear (1 = default)
  bountyPer1000: number;       // cc yang didapat per 1.000 damage (0 = off)
  pillBuffPercent: number;     // buff sementara (60)
  pillBuffHours: number;       // 8
  pillDebuffPercent: number;   // 60
  pillDebuffHours: number;     // 15.5
  regenPerHourPercent: number; // regen HP/hunger per jam (10)
  healthCostPerHit: number;    // HP yang hilang per serangan (10)
  armorDenom: number;          // 40 pada armor/(armor+40)
  dodgeDenom: number;          // 40 pada dodge/(dodge+40)
  dmgReductionCap: number;     // cap total armor DR (0.9)
  foodEfficiency: number;      // 1
}

export const DEFAULT_SETTINGS: CombatSettings = {
  militaryRankPercent: 0,
  ammoPerHit: 1,
  wearMultiplier: 1,
  bountyPer1000: 0,
  pillBuffPercent: 60,
  pillBuffHours: 8,
  pillDebuffPercent: 60,
  pillDebuffHours: 15.5,
  regenPerHourPercent: 10,
  healthCostPerHit: 10,
  armorDenom: 40,
  dodgeDenom: 40,
  dmgReductionCap: 0.9,
  foodEfficiency: 1,
};

export interface CombatStats {
  attackBase: number;
  attackBurst: number;
  attackAvg: number;
  precision: number;
  critChance: number;
  critDamage: number;
  armorTotal: number;
  dodgeTotal: number;
  maxHealth: number;
  maxHunger: number;
  armorDR: number;
  dodgeRate: number;
  healthLossPerHit: number;
  expectedHealthPerHit: number;
  critMult: number;
  normalProb: number;
  critProb: number;
  missProb: number;
  eDPHBurst: number;
  eDPH: number;
  passiveHealthPerDay: number;
  foodPerDay: number;
  healthFromFoodPerDay: number;
  totalHealthPerDay: number;
  hitsPerDay: number;
  dPD: number;
  buildCost: number;
  ammoCostPerHit: number;
  foodCostPerHit: number;
  wearCostPerHit: number;
  pillCostPerHit: number;
  costPerHit: number;
  damagePerGold: number;
  netPerHit: number;
  paybackHits: number;
}

export function emptySkillLevels(): Record<CombatSkillKey, number> {
  return {
    attack: 0,
    precision: 0,
    criticalChance: 0,
    criticalDamages: 0,
    armor: 0,
    dodge: 0,
    health: 0,
    hunger: 0,
    lootChance: 0,
  };
}

export function sumSkillCost(levels: Partial<Record<CombatSkillKey, number>>): number {
  return COMBAT_SKILLS.reduce((sum, def) => sum + skillTotalCost(levels[def.key] ?? 0), 0);
}

function gv(stats: Partial<Record<GearStatKey, number>> | undefined, key: GearStatKey): number {
  return stats?.[key] ?? 0;
}

export function computeCombatStats(
  skillLevels: Partial<Record<CombatSkillKey, number>>,
  gear: UnitGear,
  settings: CombatSettings
): CombatStats {
  const lv = (k: CombatSkillKey) => clampLevel(skillLevels[k] ?? 0);

  const attackSkill = skillValue(SKILL_MAP.attack, lv('attack'));
  const precisionSkill = skillValue(SKILL_MAP.precision, lv('precision'));
  const critChanceSkill = skillValue(SKILL_MAP.criticalChance, lv('criticalChance'));
  const critDmgSkill = skillValue(SKILL_MAP.criticalDamages, lv('criticalDamages'));
  const armorSkill = skillValue(SKILL_MAP.armor, lv('armor'));
  const dodgeSkill = skillValue(SKILL_MAP.dodge, lv('dodge'));
  const maxHealth = skillValue(SKILL_MAP.health, lv('health'));
  const maxHunger = skillValue(SKILL_MAP.hunger, lv('hunger'));

  // Precision — cap 100, overflow x4 -> attack
  let precisionTotal = precisionSkill + gv(gear.gloves?.stats, 'precision');
  const precisionCap = SKILL_MAP.precision.cap ?? 100;
  const precisionOverflow = Math.max(0, precisionTotal - precisionCap);
  precisionTotal = Math.min(precisionTotal, precisionCap);

  // Crit chance — cap 60, overflow x4 -> crit damage
  let critChanceTotal = critChanceSkill + gv(gear.weapon?.stats, 'criticalChance');
  const critCap = SKILL_MAP.criticalChance.cap ?? 60;
  const critOverflow = Math.max(0, critChanceTotal - critCap);
  critChanceTotal = Math.min(critChanceTotal, critCap);

  const attackBase =
    attackSkill + gv(gear.weapon?.stats, 'attack') + precisionOverflow * (SKILL_MAP.precision.overflowValue ?? 4);
  const critDamage =
    critDmgSkill + gv(gear.helmet?.stats, 'criticalDamages') + critOverflow * (SKILL_MAP.criticalChance.overflowValue ?? 4);

  const ammoPercent = gv(gear.ammo?.stats, 'percentAttack');
  const rankMult = 1 + Math.max(0, settings.militaryRankPercent) / 100;

  const hasPill = Boolean(gear.pill);
  const pillBurst = hasPill ? settings.pillBuffPercent : 0;
  const pillCycle = settings.pillBuffHours + settings.pillDebuffHours;
  const pillAvgFactor =
    hasPill && pillCycle > 0
      ? (settings.pillBuffHours * (1 + settings.pillBuffPercent / 100) +
          settings.pillDebuffHours * (1 - settings.pillDebuffPercent / 100)) /
        pillCycle
      : 1;

  const attackBurst = attackBase * (1 + ammoPercent / 100) * (1 + pillBurst / 100) * rankMult;
  const attackAvg = attackBase * (1 + ammoPercent / 100) * pillAvgFactor * rankMult;

  const armorTotal = armorSkill + gv(gear.chest?.stats, 'armor') + gv(gear.pants?.stats, 'armor');
  const dodgeTotal = dodgeSkill + gv(gear.boots?.stats, 'dodge');

  const armorDR = Math.min(settings.dmgReductionCap, armorTotal / (armorTotal + settings.armorDenom));
  const dodgeRate = Math.min(settings.dmgReductionCap, dodgeTotal / (dodgeTotal + settings.dodgeDenom));
  const healthLossPerHit = Math.max(1, settings.healthCostPerHit * (1 - armorDR));
  const expectedHealthPerHit = healthLossPerHit * (1 - dodgeRate);

  // Distribusi pukulan: crit hanya terjadi pada hit yang kena (precision).
  const hitProb = Math.min(1, precisionTotal / 100);
  const critProb = Math.min(hitProb, critChanceTotal / 100);
  const normalProb = hitProb - critProb;
  const missProb = Math.max(0, 1 - hitProb);

  const critMult = 1 + critDamage / 100;
  const eDPHBurst = critProb * attackBurst * critMult + normalProb * attackBurst + missProb * (attackBurst / 2);
  const eDPH = critProb * attackAvg * critMult + normalProb * attackAvg + missProb * (attackAvg / 2);

  // Sustain — HP & hunger pulih 10%/jam (24 jam -> x2.4 + full awal = x3.4/hari)
  const regenMult = 1 + (24 * settings.regenPerHourPercent) / 100;
  const passiveHealthPerDay = maxHealth * regenMult;
  const foodPerDay = gear.food ? maxHunger * regenMult * settings.foodEfficiency : 0;
  const healthFromFoodPerDay = foodPerDay * (gear.food?.healPercent ?? 0) / 100 * maxHealth;
  const totalHealthPerDay = passiveHealthPerDay + healthFromFoodPerDay;
  const hitsPerDay = totalHealthPerDay / Math.max(1e-6, expectedHealthPerHit);
  const dPD = hitsPerDay * eDPH;

  // Ekonomi per serangan
  const buildCost =
    (gear.weapon?.price ?? 0) +
    (gear.helmet?.price ?? 0) +
    (gear.chest?.price ?? 0) +
    (gear.pants?.price ?? 0) +
    (gear.boots?.price ?? 0) +
    (gear.gloves?.price ?? 0) +
    (gear.ammo?.price ?? 0) +
    (gear.food?.price ?? 0) +
    (gear.pill?.price ?? 0);

  const ammoCostPerHit = gear.ammo ? (gear.ammo.price ?? 0) * settings.ammoPerHit : 0;
  const foodCostPerHit = foodPerDay > 0 ? (gear.food?.price ?? 0) * foodPerDay / Math.max(1, hitsPerDay) : 0;
  const pillCostPerHit = hitsPerDay > 0 ? (gear.pill?.price ?? 0) / Math.max(1, hitsPerDay) : 0;
  const wearCostPerHit =
    (settings.wearMultiplier *
      ((gear.weapon ? (gear.weapon.price * gear.weapon.wear) / 100 : 0) +
        (gear.helmet ? (gear.helmet.price * gear.helmet.wear) / 100 : 0) +
        (gear.chest ? (gear.chest.price * gear.chest.wear) / 100 : 0) +
        (gear.pants ? (gear.pants.price * gear.pants.wear) / 100 : 0) +
        (gear.boots ? (gear.boots.price * gear.boots.wear) / 100 : 0) +
        (gear.gloves ? (gear.gloves.price * gear.gloves.wear) / 100 : 0)));

  const costPerHit = ammoCostPerHit + foodCostPerHit + pillCostPerHit + wearCostPerHit;
  const damagePerGold = costPerHit > 0 ? eDPH / costPerHit : 0;
  const bountyPerHit = (settings.bountyPer1000 * eDPH) / 1000;
  const netPerHit = bountyPerHit - costPerHit;
  const paybackHits = netPerHit > 0 ? buildCost / netPerHit : Infinity;

  return {
    attackBase,
    attackBurst,
    attackAvg,
    precision: precisionTotal,
    critChance: critChanceTotal,
    critDamage,
    armorTotal,
    dodgeTotal,
    maxHealth,
    maxHunger,
    armorDR,
    dodgeRate,
    healthLossPerHit,
    expectedHealthPerHit,
    critMult,
    normalProb,
    critProb,
    missProb,
    eDPHBurst,
    eDPH,
    passiveHealthPerDay,
    foodPerDay,
    healthFromFoodPerDay,
    totalHealthPerDay,
    hitsPerDay,
    dPD,
    buildCost,
    ammoCostPerHit,
    foodCostPerHit,
    wearCostPerHit,
    pillCostPerHit,
    costPerHit,
    damagePerGold,
    netPerHit,
    paybackHits,
  };
}

// ============================================================================
// Optimizer Skill
// ============================================================================

export type OptimizeObjective = 'dph' | 'dpd';

export interface OptimizeResult {
  levels: Record<CombatSkillKey, number>;
  spent: number;
  remaining: number;
}

export function optimizeSkills(opts: {
  skillLevels: Record<CombatSkillKey, number>;
  playerLevel: number;
  pointsPerLevel?: number;
  lockedNonCombatPoints?: number;
  objective: OptimizeObjective;
  gear: UnitGear;
  settings: CombatSettings;
  mode: 'respec' | 'incremental';
  exclude?: CombatSkillKey[];
}): OptimizeResult {
  const pp = opts.pointsPerLevel ?? DEFAULT_POINTS_PER_LEVEL;
  const totalPoints = Math.max(0, Math.round(opts.playerLevel * pp));
  const exclude = new Set<CombatSkillKey>(opts.exclude ?? ['lootChance']);
  const current = { ...opts.skillLevels };
  const lockedNonCombat = opts.lockedNonCombatPoints ?? 0;

  let levels: Record<CombatSkillKey, number>;
  let budget: number;

  if (opts.mode === 'respec') {
    levels = emptySkillLevels();
    for (const k of exclude) levels[k] = clampLevel(current[k] ?? 0);
    budget = totalPoints - lockedNonCombat;
    for (const k of exclude) budget -= skillTotalCost(levels[k]);
  } else {
    levels = { ...current };
    budget = totalPoints - lockedNonCombat - sumSkillCost(current);
  }
  budget = Math.max(0, budget);

  const evaluate = (l: Record<CombatSkillKey, number>) =>
    opts.objective === 'dph'
      ? computeCombatStats(l, opts.gear, opts.settings).eDPHBurst
      : computeCombatStats(l, opts.gear, opts.settings).dPD;

  let guard = 0;
  while (budget > 0 && guard++ < 200) {
    let best: { key: CombatSkillKey; gain: number; cost: number } | null = null;
    for (const def of COMBAT_SKILLS) {
      if (exclude.has(def.key)) continue;
      const l = levels[def.key];
      if (l >= MAX_SKILL_LEVEL) continue;
      if (opts.playerLevel < def.unlockAtLevel) continue;
      const cost = skillPointCost(l + 1);
      if (cost > budget) continue;

      const before = evaluate(levels);
      const next = { ...levels, [def.key]: l + 1 };
      const after = evaluate(next);
      const delta = after - before;
      if (delta <= 0) continue;
      const gain = delta / cost;
      if (!best || gain > best.gain) best = { key: def.key, gain, cost };
    }
    if (!best) break;
    levels[best.key] += 1;
    budget -= best.cost;
  }

  return { levels, spent: sumSkillCost(levels), remaining: budget };
}

// ============================================================================
// Generator Build
// ============================================================================

export type BuildObjective = 'dph' | 'dpd' | 'roi';

export interface BuildCandidate {
  gear: UnitGear;
  stats: CombatStats;
  cost: number;
}

export function generateBuilds(opts: {
  skillLevels: Record<CombatSkillKey, number>;
  gearOptions: Record<GearSlot, GearPiece[]>;
  objective: BuildObjective;
  settings: CombatSettings;
  budget: number;
  topKPerSlot?: number;
  maxResults?: number;
  requireWeapon?: boolean;
}): BuildCandidate[] {
  const K = opts.topKPerSlot ?? 3;
  const maxResults = opts.maxResults ?? 12;
  const requireWeapon = opts.requireWeapon ?? true;
  const skillLevels = opts.skillLevels;
  const gearOptions = opts.gearOptions;

  const metric = (stats: CombatStats): number => {
    switch (opts.objective) {
      case 'dph':
        return stats.eDPHBurst;
      case 'dpd':
        return stats.dPD;
      case 'roi':
        return stats.damagePerGold;
      default:
        return stats.eDPHBurst;
    }
  };

  const slots: GearSlot[] = ['weapon', 'helmet', 'chest', 'pants', 'boots', 'gloves', 'ammo', 'food', 'pill'];

  // Ranking tiap slot: ambil top-K untuk slot gear (senjata & armor);
  // consumable diikutkan semua karena jumlahnya sedikit.
  const slotCandidates: { slot: GearSlot; options: GearPiece[] }[] = [];
  for (const slot of slots) {
    const options = gearOptions[slot] ?? [];
    const scored = options
      .map((piece) => ({
        piece,
        score: metric(computeCombatStats(skillLevels, { [slot]: piece } as UnitGear, opts.settings)),
      }))
      .sort((a, b) => b.score - a.score);

    const keep =
      slot === 'ammo' || slot === 'food' || slot === 'pill'
        ? options
        : scored.slice(0, K).map((s) => s.piece);
    slotCandidates.push({ slot, options: keep });
  }

  const results: BuildCandidate[] = [];
  const gear: UnitGear = {};

  const recurse = (idx: number, costSoFar: number) => {
    if (idx === slotCandidates.length) {
      const stats = computeCombatStats(skillLevels, gear, opts.settings);
      results.push({ gear: { ...gear }, stats, cost: stats.buildCost });
      return;
    }
    const { slot, options } = slotCandidates[idx];

    // Tanpa gear (none) — kecuali weapon: build combat wajib memakai senjata
    if (!(requireWeapon && slot === 'weapon')) {
      recurse(idx + 1, costSoFar);
    }

    for (const piece of options) {
      const c = costSoFar + piece.price;
      if (opts.budget > 0 && c > opts.budget) continue;
      const prev = gear[slot];
      gear[slot] = piece;
      recurse(idx + 1, c);
      if (prev) {
        gear[slot] = prev;
      } else {
        delete gear[slot];
      }
    }
  };

  recurse(0, 0);
  results.sort((a, b) => metric(b.stats) - metric(a.stats));
  return results.slice(0, maxResults);
}

// ============================================================================

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
}
