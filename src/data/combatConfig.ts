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
  { key: 'lootChance', name: 'Loot Chance', group: 'sustain', desc: '+2% loot/level', base: 2, perLevel: 2, unlockAtLevel: 1 },
];

export const SKILL_MAP = Object.fromEntries(
  COMBAT_SKILLS.map((s) => [s.key, s])
) as Record<CombatSkillKey, SkillDef>;

// ============================================================================
// Economic Skills
// ============================================================================

export type EconomicSkillKey =
  | 'entrepreneurship'
  | 'energy'
  | 'production'
  | 'companies'
  | 'management';

export interface EconomicSkillDef {
  key: EconomicSkillKey;
  name: string;
  desc: string;
  base: number;
  perLevel: number;
}

export const ECONOMIC_SKILLS: EconomicSkillDef[] = [
  { key: 'entrepreneurship', name: 'Entrepreneurship', desc: 'Membuka slot perusahaan', base: 0, perLevel: 1 },
  { key: 'energy', name: 'Energy', desc: '+1 energy/level', base: 10, perLevel: 1 },
  { key: 'production', name: 'Production', desc: '+1 production slot/level', base: 0, perLevel: 1 },
  { key: 'companies', name: 'Companies', desc: '+1 company slot/level', base: 1, perLevel: 1 },
  { key: 'management', name: 'Management', desc: '+1 management slot/level', base: 0, perLevel: 1 },
];

export const ECONOMIC_SKILL_MAP = Object.fromEntries(
  ECONOMIC_SKILLS.map((s) => [s.key, s])
) as Record<EconomicSkillKey, EconomicSkillDef>;

export function emptyEconomicSkillLevels(): Record<EconomicSkillKey, number> {
  return {
    entrepreneurship: 0,
    energy: 0,
    production: 0,
    companies: 0,
    management: 0,
  };
}

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
  | 'food';

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
];

export const SLOT_LABEL: Record<GearSlot, string> = Object.fromEntries(
  GEAR_SLOTS.map((s) => [s.slot, s.label])
) as Record<GearSlot, string>;

// Estimasi harga gear (tidak dijual di Item Markt, jadi tidak ada harga pasar).
// Harga bisa diedit manual di UI.
// Source: WarEra War Planner defaults (TheGroxEmpire/warera-war-planner)
const RARITY_PRICE: Record<string, number> = {
  common: 2,
  uncommon: 7,
  rare: 27,
  epic: 70,
  legendary: 210,
  mythic: 650,
};
const WEAPON_PRICE: Record<string, number> = {
  knife: 2,
  gun: 8,
  rifle: 27,
  sniper: 70,
  tank: 200,
  jet: 650,
};
export const CONSUMABLE_ESTIMATES: Record<string, number> = {
  lightAmmo: 0.2,
  ammo: 0.7,
  heavyAmmo: 2.7,
  bread: 1.7,
  steak: 3.7,
  cookedFish: 7.6,
  cocain: 36,
};

function gearSlotOfItem(item: GameItem): GearSlot | null {
  if (item.usage === 'weapon') return 'weapon';
  if (['helmet', 'chest', 'pants', 'boots', 'gloves'].includes(item.usage ?? '')) {
    return item.usage as GearSlot;
  }
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
        : slot === 'ammo' || slot === 'food'
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
    wear: slot === 'weapon' ? 2 : slot === 'ammo' || slot === 'food' ? 0 : 1,
  };
  if (slot === 'food') piece.healPercent = stats.healthRegenPercent;
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
  bountyPer1000: number;       // cc yang didapat per 1.000 damage (0 = off)
  pillEnabled: boolean;        // pill/cocain aktif (buff +60% attack)
  regenPerHourPercent: number; // regen HP/hunger per jam (10)
  healthCostPerHit: number;    // HP yang hilang per serangan (10)
  armorDenom: number;          // 40 pada armor/(armor+40)
  dodgeDenom: number;          // 40 pada dodge/(dodge+40)
  dmgReductionCap: number;     // cap total armor DR (0.9)
}

export const DEFAULT_SETTINGS: CombatSettings = {
  militaryRankPercent: 0,
  ammoPerHit: 1,
  bountyPer1000: 0,
  pillEnabled: true,
  regenPerHourPercent: 10,
  healthCostPerHit: 10,
  armorDenom: 40,
  dodgeDenom: 40,
  dmgReductionCap: 0.9,
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

  const hasPill = settings.pillEnabled;
  const pillBurst = hasPill ? 60 : 0;

  const attackBurst = attackBase * (1 + ammoPercent / 100) * (1 + pillBurst / 100) * rankMult;

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

  // Sustain — matching war planner model:
  // Pill reduces regen window to 18h (debuff hours consume part of the day).
  const regenHours = hasPill ? 18 : 24;
  const regenRate = settings.regenPerHourPercent / 100; // 0.10
  const passiveHealthPerDay = maxHealth * regenRate * regenHours;
  const foodHealPct = gear.food?.healPercent ?? 0;
  const foodBonus = (foodHealPct / 100) * maxHealth;
  const foodRegenPerDay = (hasPill || gear.food) ? maxHunger * regenRate * regenHours * foodBonus : 0;
  const totalHealthPerDay = passiveHealthPerDay + foodRegenPerDay;
  const hitsPerDay = totalHealthPerDay / Math.max(1e-6, expectedHealthPerHit);

  const dPD = hitsPerDay * eDPHBurst;

  // Ekonomi per hari (matching war planner)
  const buildCost =
    (gear.weapon?.price ?? 0) +
    (gear.helmet?.price ?? 0) +
    (gear.chest?.price ?? 0) +
    (gear.pants?.price ?? 0) +
    (gear.boots?.price ?? 0) +
    (gear.gloves?.price ?? 0) +
    (gear.ammo?.price ?? 0) +
    (gear.food?.price ?? 0);

  // Ammo cost: price × ammoPerHit × hitsPerDay
  const ammoCostPerHit = gear.ammo ? (gear.ammo.price ?? 0) * settings.ammoPerHit : 0;
  const ammoCostPerDay = ammoCostPerHit * hitsPerDay;

  // Food cost: price × hungerLevel × dayMultiplier (pill reduces multiplier)
  const dayMultiplier = hasPill ? 1.8 : 2.4;
  const foodCostPerDay = gear.food ? gear.food.price * maxHunger * dayMultiplier : 0;
  const foodCostPerHit = hitsPerDay > 0 ? foodCostPerDay / hitsPerDay : 0;

  // Pill cost: flat price per day (36cc)
  const PILL_PRICE = 36;
  const pillCostPerDay = hasPill ? PILL_PRICE : 0;
  const pillCostPerHit = hitsPerDay > 0 ? pillCostPerDay / hitsPerDay : 0;

  // Gear wear cost: weapon decay = price/100 × hits, armor decay = price/100 × hits × (1-dodge/(dodge+40))
  const armorDecayMultiplier = 1 - dodgeRate;
  const weaponDecayCost = gear.weapon ? (gear.weapon.price / 100) * hitsPerDay : 0;
  const armorDecayCost =
    ((gear.helmet ? gear.helmet.price : 0) +
     (gear.chest ? gear.chest.price : 0) +
     (gear.pants ? gear.pants.price : 0) +
     (gear.boots ? gear.boots.price : 0) +
     (gear.gloves ? gear.gloves.price : 0)) / 100 * hitsPerDay * armorDecayMultiplier;
  const wearCostPerHit = hitsPerDay > 0 ? (weaponDecayCost + armorDecayCost) / hitsPerDay : 0;

  const costPerHit = ammoCostPerHit + foodCostPerHit + pillCostPerHit + wearCostPerHit;
  const damagePerGold = costPerHit > 0 ? eDPHBurst / costPerHit : 0;
  const bountyPerHit = (settings.bountyPer1000 * eDPHBurst) / 1000;
  const netPerHit = bountyPerHit - costPerHit;
  const paybackHits = netPerHit > 0 ? buildCost / netPerHit : Infinity;

  return {
    attackBase,
    attackBurst,
    attackAvg: attackBurst,
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
    eDPH: eDPHBurst,
    passiveHealthPerDay,
    foodPerDay: foodRegenPerDay,
    healthFromFoodPerDay: foodRegenPerDay,
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

  let lockedLevels: Record<CombatSkillKey, number>;
  let budget: number;

  if (opts.mode === 'respec') {
    lockedLevels = emptySkillLevels();
    for (const k of exclude) lockedLevels[k] = clampLevel(current[k] ?? 0);
    budget = totalPoints - lockedNonCombat;
    for (const k of exclude) budget -= skillTotalCost(lockedLevels[k]);
  } else {
    lockedLevels = { ...current };
    budget = totalPoints - lockedNonCombat - sumSkillCost(current);
  }
  budget = Math.max(0, budget);

  // War Planner approach: exact search with damage/sustain budget split
  // Damage skills: attack, precision, criticalChance, criticalDamages
  // Sustain skills: armor, dodge, health, hunger
  const damageKeys: CombatSkillKey[] = ['attack', 'precision', 'criticalChance', 'criticalDamages'];
  const sustainKeys: CombatSkillKey[] = ['armor', 'dodge', 'health', 'hunger'];

  // Check which skills are available at player level
  const availDamage = damageKeys.filter(k => opts.playerLevel >= SKILL_MAP[k].unlockAtLevel && !exclude.has(k));
  const availSustain = sustainKeys.filter(k => opts.playerLevel >= SKILL_MAP[k].unlockAtLevel && !exclude.has(k));

  // Precompute costs for all levels 0..MAX_SKILL_LEVEL
  const costCache: number[] = [];
  for (let i = 0; i <= MAX_SKILL_LEVEL; i++) costCache[i] = skillTotalCost(i);

  // Generate all possible skill level combinations within budget for a group
  type Pattern = { cost: number; levels: number[]; keys: CombatSkillKey[] };
  function genPatterns(keys: CombatSkillKey[], budgetLimit: number): Pattern[] {
    if (keys.length === 0) return [{ cost: 0, levels: [], keys: [] }];
    const results: Pattern[] = [];
    const helper = (idx: number, usedBudget: number, currentLevels: number[]) => {
      if (idx === keys.length) {
        results.push({ cost: usedBudget, levels: [...currentLevels], keys: [...keys] });
        return;
      }
      const key = keys[idx];
      const lockedLv = lockedLevels[key] ?? 0;
      for (let lv = lockedLv; lv <= MAX_SKILL_LEVEL; lv++) {
        const added = costCache[lv] - costCache[lockedLv];
        if (usedBudget + added > budgetLimit) break;
        currentLevels.push(lv);
        helper(idx + 1, usedBudget + added, currentLevels);
        currentLevels.pop();
      }
    };
    helper(0, 0, []);
    return results;
  }

  // Generate all patterns within full budget
  const damagePatterns = genPatterns(availDamage, budget);
  const sustainPatterns = genPatterns(availSustain, budget);

  // Evaluate a combined skill set
  const evalSkills = (dmgPattern: Pattern, susPattern: Pattern): number => {
    const allLevels = { ...lockedLevels };
    for (let i = 0; i < dmgPattern.keys.length; i++) allLevels[dmgPattern.keys[i]] = dmgPattern.levels[i];
    for (let i = 0; i < susPattern.keys.length; i++) allLevels[susPattern.keys[i]] = susPattern.levels[i];
    const stats = computeCombatStats(allLevels, opts.gear, opts.settings);
    return opts.objective === 'dph' ? stats.eDPHBurst : stats.dPD;
  };

  // Find best combination
  let bestLevels = { ...lockedLevels };
  let bestValue = -Infinity;

  for (const dp of damagePatterns) {
    const remainBudget = budget - dp.cost;
    for (const sp of sustainPatterns) {
      if (sp.cost > remainBudget) continue;
      const val = evalSkills(dp, sp);
      if (val > bestValue) {
        bestValue = val;
        bestLevels = { ...lockedLevels };
        for (let i = 0; i < dp.keys.length; i++) bestLevels[dp.keys[i]] = dp.levels[i];
        for (let i = 0; i < sp.keys.length; i++) bestLevels[sp.keys[i]] = sp.levels[i];
      }
    }
  }

  return { levels: bestLevels, spent: sumSkillCost(bestLevels), remaining: budget - sumSkillCost(bestLevels) + sumSkillCost(lockedLevels) };
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
  maxRarity?: string;
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

  const slots: GearSlot[] = ['weapon', 'helmet', 'chest', 'pants', 'boots', 'gloves', 'ammo', 'food'];

  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const selectedRarity = opts.maxRarity ?? 'mythic';

  // Ranking tiap slot: ambil top-K untuk slot gear (senjata & armor);
  // consumable diikutkan semua karena jumlahnya sedikit.
  // Filter: gear harus EXACT rarity yang dipilih (kecuali ammo & food).
  const slotCandidates: { slot: GearSlot; options: GearPiece[] }[] = [];
  for (const slot of slots) {
    const options = (gearOptions[slot] ?? []).filter((p) => {
      if (slot === 'ammo' || slot === 'food') return true;
      return p.rarity === selectedRarity;
    });
    const scored = options
      .map((piece) => ({
        piece,
        score: metric(computeCombatStats(skillLevels, { [slot]: piece } as UnitGear, opts.settings)),
      }))
      .sort((a, b) => b.score - a.score);

    const keep =
      slot === 'ammo' || slot === 'food'
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

    // Knife = melee weapon, tidak butuh ammo → skip slot ammo
    if (slot === 'ammo' && gear.weapon?.code === 'knife') {
      recurse(idx + 1, costSoFar);
      return;
    }

    // Setiap slot WAJIB diisi (tidak ada opsi "tanpa gear")
    for (const piece of options) {
      const c = costSoFar + piece.price;
      if (opts.budget > 0 && c > opts.budget) continue;
      gear[slot] = piece;
      recurse(idx + 1, c);
    }
    delete gear[slot];
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

// ============================================================================
// Combat Simulation
// ============================================================================

export interface SimSettings {
  numHits: number;
  bountyPer1000: number;
  case1Price: number;
  case2Price: number;
  scrapPrice: number;
  steelPrice: number;
  scrapConsumedPrice: number;
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
  numHits: 100,
  bountyPer1000: 0,
  case1Price: 3.2,
  case2Price: 2.1,
  scrapPrice: 0.22,
  steelPrice: 0.5,
  scrapConsumedPrice: 0.15,
};

export interface SimHit {
  outcome: 'normal' | 'crit' | 'miss' | 'dodge';
  damage: number;
  crit: boolean;
}

export interface SimResult {
  hits: SimHit[];
  totalHits: number;
  totalDamage: number;
  expectedDamage: number;
  normalHits: number;
  critHits: number;
  missHits: number;
  dodgeHits: number;
  critPct: number;
  missPct: number;
  dodgePct: number;
  avgDamage: number;
  burstDamage: number;
  costs: {
    weapon: number;
    armor: number;
    ammo: number;
    food: number;
    booster: number;
    total: number;
  };
  resources: {
    steelConsumed: number;
    scrapConsumed: number;
  };
  revenue: {
    bounty: number;
    case1Drops: number;
    case1Revenue: number;
    case2Drops: number;
    case2Revenue: number;
    scrapDrops: number;
    scrapRevenue: number;
    total: number;
  };
  costPer1kDmg: number;
  netProfit: number;
  roi: number;
}

export function simulateCombat(
  stats: CombatStats,
  gear: UnitGear,
  simSettings: SimSettings,
  combatSettings: CombatSettings,
  lootChanceLevel: number,
): SimResult {
  const N = Math.max(1, simSettings.numHits);
  const hits: SimHit[] = [];
  let totalDamage = 0;
  let normalHits = 0;
  let critHits = 0;
  let missHits = 0;
  let dodgeHits = 0;

  const hitProb = Math.min(1, stats.precision / 100);
  const critProb = Math.min(hitProb, stats.critChance / 100);
  const dodgeProb = stats.dodgeRate;
  const missProb = Math.max(0, 1 - hitProb);

  const critMult = 1 + stats.critDamage / 100;

  for (let i = 0; i < N; i++) {
    const roll = Math.random();
    const dodgeRoll = Math.random();

    if (dodgeRoll < dodgeProb) {
      hits.push({ outcome: 'dodge', damage: 0, crit: false });
      dodgeHits++;
      continue;
    }

    if (roll < missProb) {
      hits.push({ outcome: 'miss', damage: 0, crit: false });
      missHits++;
      continue;
    }

    if (roll < missProb + critProb) {
      const dmg = Math.round(stats.attackBurst * critMult * (0.9 + Math.random() * 0.2));
      hits.push({ outcome: 'crit', damage: dmg, crit: true });
      totalDamage += dmg;
      critHits++;
    } else {
      const dmg = Math.round(stats.attackBurst * (0.9 + Math.random() * 0.2));
      hits.push({ outcome: 'normal', damage: dmg, crit: false });
      totalDamage += dmg;
      normalHits++;
    }
  }

  const successfulHits = normalHits + critHits;

  // Costs — matching war planner model
  // Gear decay: weapon = price/100 × hits, armor = price/100 × hits × (1-dodge/(dodge+40))
  const armorDecayMult = 1 - stats.dodgeRate;
  const weaponCostPerHit = gear.weapon ? gear.weapon.price / 100 : 0;
  const armorCostPerHit =
    ((gear.helmet ? gear.helmet.price : 0) +
     (gear.chest ? gear.chest.price : 0) +
     (gear.pants ? gear.pants.price : 0) +
     (gear.boots ? gear.boots.price : 0) +
     (gear.gloves ? gear.gloves.price : 0)) / 100 * armorDecayMult;
  const ammoCostPerHit = gear.ammo ? gear.ammo.price * combatSettings.ammoPerHit : 0;

  // Food cost: price × hungerLevel × dayMultiplier (pill = 1.8, normal = 2.4)
  const hasPill = combatSettings.pillEnabled;
  const dayMultiplier = hasPill ? 1.8 : 2.4;
  const foodCostPerDay = gear.food ? gear.food.price * stats.maxHunger * dayMultiplier : 0;
  const foodCostPerHit = stats.hitsPerDay > 0 ? foodCostPerDay / stats.hitsPerDay : 0;

  // Pill cost: flat price per day (36cc)
  const PILL_PRICE = 36;
  const pillCostPerDay = hasPill ? PILL_PRICE : 0;
  const pillCostPerHit = stats.hitsPerDay > 0 ? pillCostPerDay / stats.hitsPerDay : 0;

  const weaponTotal = weaponCostPerHit * N;
  const armorTotal = armorCostPerHit * N;
  const ammoTotal = ammoCostPerHit * N;
  const foodTotal = foodCostPerHit * N;
  const boosterTotal = pillCostPerHit * N;
  const totalCosts = weaponTotal + armorTotal + ammoTotal + foodTotal + boosterTotal;

  // Loot drops — war planner formula: loot = 0.02 + 0.02 × level
  const lootRate = Math.min(0.5, 0.02 + 0.02 * lootChanceLevel);
  const successfulHitsForLoot = successfulHits;
  const case1Drops = Math.round(lootRate * successfulHitsForLoot);
  const case2Drops = Math.round((lootRate / 100) * successfulHitsForLoot);
  const scrapDrops = Math.round(lootRate * 5 * successfulHitsForLoot);

  const case1Revenue = case1Drops * simSettings.case1Price;
  const case2Revenue = case2Drops * simSettings.case2Price;
  const scrapRevenue = scrapDrops * simSettings.scrapPrice;

  // Bounty revenue
  const bountyRevenue = (simSettings.bountyPer1000 * totalDamage) / 1000;

  const totalRevenue = bountyRevenue + case1Revenue + case2Revenue + scrapRevenue;

  // Resources consumed (estimated based on gear)
  const steelConsumed = Math.round(N * (gear.weapon ? 0.18 : 0));
  const scrapConsumed = Math.round(N * (
    (gear.helmet ? 0.1 : 0) + (gear.chest ? 0.12 : 0) + (gear.pants ? 0.08 : 0) +
    (gear.boots ? 0.06 : 0) + (gear.gloves ? 0.05 : 0)
  ));

  const costPer1kDmg = totalDamage > 0 ? (totalCosts / totalDamage) * 1000 : 0;
  const netProfit = totalRevenue - totalCosts;
  const roi = totalCosts > 0 ? (netProfit / totalCosts) * 100 : 0;

  return {
    hits,
    totalHits: N,
    totalDamage,
    expectedDamage: Math.round(stats.eDPHBurst * N),
    normalHits,
    critHits,
    missHits,
    dodgeHits,
    critPct: N > 0 ? (critHits / N) * 100 : 0,
    missPct: N > 0 ? (missHits / N) * 100 : 0,
    dodgePct: N > 0 ? (dodgeHits / N) * 100 : 0,
    avgDamage: successfulHits > 0 ? Math.round(totalDamage / successfulHits) : 0,
    burstDamage: Math.round(stats.attackBurst),
    costs: {
      weapon: Math.round(weaponTotal * 1000) / 1000,
      armor: Math.round(armorTotal * 1000) / 1000,
      ammo: Math.round(ammoTotal * 1000) / 1000,
      food: Math.round(foodTotal * 1000) / 1000,
      booster: Math.round(boosterTotal * 1000) / 1000,
      total: Math.round(totalCosts * 1000) / 1000,
    },
    resources: { steelConsumed, scrapConsumed },
    revenue: {
      bounty: Math.round(bountyRevenue * 1000) / 1000,
      case1Drops,
      case1Revenue: Math.round(case1Revenue * 1000) / 1000,
      case2Drops,
      case2Revenue: Math.round(case2Revenue * 1000) / 1000,
      scrapDrops,
      scrapRevenue: Math.round(scrapRevenue * 1000) / 1000,
      total: Math.round(totalRevenue * 1000) / 1000,
    },
    costPer1kDmg: Math.round(costPer1kDmg * 1000) / 1000,
    netProfit: Math.round(netProfit * 1000) / 1000,
    roi: Math.round(roi * 10) / 10,
  };
}
