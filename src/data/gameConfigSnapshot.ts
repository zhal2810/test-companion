// Snapshot otoritatif dari gameConfig.getGameConfig -> items (diambil 2026-08-14).
// Dipakai sebagai data bawaan aplikasi; bisa di-refresh runtime lewat refreshGameConfig().
// IconComponent (ref React) sengaja dibuang karena tidak bisa diserialisasi.

export interface RawGameItem {
  type: string;
  code: string;
  rarity: string;
  productionPoints?: number;
  productionNeeds?: Record<string, number>;
  flatStats?: Record<string, number>;
  dynamicStats?: Record<string, number[]>;
  isConsumable?: boolean;
  isTradable?: boolean;
  iconImg?: string;
  usage?: string;
  skinSlot?: string;
  isDeposit?: boolean;
  climates?: string[];
}

export const GAME_CONFIG_ITEMS: Record<string, RawGameItem> = {
  limestone: { type: 'raw', code: 'limestone', rarity: 'common', productionPoints: 1, isDeposit: true, climates: ['moderate', 'arid'], isTradable: true },
  grain: { type: 'raw', code: 'grain', rarity: 'common', productionPoints: 1, isDeposit: true, climates: ['moderate', 'tropical'], isTradable: true },
  livestock: { type: 'raw', code: 'livestock', rarity: 'common', productionPoints: 20, isDeposit: true, climates: ['moderate', 'tropical'], isTradable: true },
  fish: { type: 'raw', code: 'fish', rarity: 'common', productionPoints: 40, isDeposit: true, climates: ['polar'], isTradable: true },
  iron: { type: 'raw', code: 'iron', rarity: 'common', productionPoints: 1, isDeposit: true, climates: ['moderate', 'arid', 'tropical', 'polar'], isTradable: true },
  coca: { type: 'raw', code: 'coca', rarity: 'common', productionPoints: 1, isDeposit: true, climates: ['tropical'], isTradable: true },
  lead: { type: 'raw', code: 'lead', rarity: 'common', productionPoints: 1, isDeposit: true, climates: ['moderate', 'arid', 'polar'], isTradable: true },
  petroleum: { type: 'raw', code: 'petroleum', rarity: 'common', productionPoints: 1, isDeposit: true, climates: ['moderate', 'arid', 'tropical'], isTradable: true },
  wood: { type: 'raw', code: 'wood', rarity: 'common', productionPoints: 1, isDeposit: true, climates: ['moderate', 'tropical', 'polar'], isTradable: true },
  concrete: { type: 'product', code: 'concrete', rarity: 'uncommon', productionPoints: 10, productionNeeds: { limestone: 10 }, isTradable: true },
  steel: { type: 'product', code: 'steel', rarity: 'uncommon', productionPoints: 10, productionNeeds: { iron: 10 }, isTradable: true },
  bread: { type: 'product', code: 'bread', rarity: 'uncommon', productionPoints: 10, productionNeeds: { grain: 10 }, flatStats: { healthRegenPercent: 10 }, isConsumable: true, isTradable: true, iconImg: 'bread.png' },
  steak: { type: 'product', code: 'steak', rarity: 'rare', productionPoints: 20, productionNeeds: { livestock: 1 }, flatStats: { healthRegenPercent: 15 }, isConsumable: true, isTradable: true },
  cookedFish: { type: 'product', code: 'cookedFish', rarity: 'epic', productionPoints: 40, productionNeeds: { fish: 1 }, flatStats: { healthRegenPercent: 20 }, isConsumable: true, isTradable: true },
  lightAmmo: { type: 'product', code: 'lightAmmo', usage: 'ammo', skinSlot: 'lightAmmo', rarity: 'uncommon', productionPoints: 1, productionNeeds: { lead: 1 }, flatStats: { percentAttack: 10 }, isTradable: true },
  ammo: { type: 'product', code: 'ammo', usage: 'ammo', skinSlot: 'ammo', rarity: 'rare', productionPoints: 4, productionNeeds: { lead: 4 }, flatStats: { percentAttack: 20 }, isTradable: true },
  cocain: { type: 'product', code: 'cocain', rarity: 'epic', productionPoints: 200, productionNeeds: { coca: 200 }, flatStats: { percentAttack: 60, buffDurationHours: 8, debuffDurationHours: 15.5 }, isTradable: true },
  oil: { type: 'product', code: 'oil', rarity: 'uncommon', productionPoints: 1, productionNeeds: { petroleum: 1 }, isTradable: true },
  paper: { type: 'product', code: 'paper', rarity: 'uncommon', productionPoints: 1, productionNeeds: { wood: 1 }, isTradable: true },
  heavyAmmo: { type: 'product', code: 'heavyAmmo', usage: 'ammo', skinSlot: 'heavyAmmo', rarity: 'epic', productionPoints: 16, productionNeeds: { lead: 16 }, flatStats: { percentAttack: 40 }, isTradable: true },
  scraps: { type: 'product', code: 'scraps', rarity: 'rare', isTradable: true },
  knife: { type: 'weapon', code: 'knife', usage: 'weapon', skinSlot: 'knife', rarity: 'common', dynamicStats: { attack: [21, 40], criticalChance: [1, 5] } },
  gun: { type: 'weapon', code: 'gun', usage: 'weapon', skinSlot: 'gun', rarity: 'uncommon', dynamicStats: { attack: [51, 60], criticalChance: [6, 10] } },
  rifle: { type: 'weapon', code: 'rifle', usage: 'weapon', skinSlot: 'rifle', rarity: 'rare', dynamicStats: { attack: [71, 90], criticalChance: [11, 15] } },
  sniper: { type: 'weapon', code: 'sniper', usage: 'weapon', skinSlot: 'sniper', rarity: 'epic', dynamicStats: { attack: [101, 130], criticalChance: [16, 20] } },
  tank: { type: 'weapon', code: 'tank', usage: 'weapon', skinSlot: 'tank', rarity: 'legendary', dynamicStats: { attack: [141, 170], criticalChance: [26, 35] } },
  jet: { type: 'weapon', code: 'jet', usage: 'weapon', skinSlot: 'jet', rarity: 'mythic', dynamicStats: { attack: [221, 300], criticalChance: [41, 50] } },
  case1: { usage: 'case', type: 'case', code: 'case1', rarity: 'legendary', isTradable: true },
  case2: { usage: 'case', type: 'case', code: 'case2', rarity: 'mythic', isTradable: true },
  helmet1: { type: 'equipment', code: 'helmet1', usage: 'helmet', skinSlot: 'helmet', rarity: 'common', iconImg: 'helmet.png', dynamicStats: { criticalDamages: [1, 15] } },
  helmet2: { type: 'equipment', code: 'helmet2', usage: 'helmet', skinSlot: 'helmet', rarity: 'uncommon', iconImg: 'helmet.png', dynamicStats: { criticalDamages: [16, 30] } },
  helmet3: { type: 'equipment', code: 'helmet3', usage: 'helmet', skinSlot: 'helmet', rarity: 'rare', iconImg: 'helmet.png', dynamicStats: { criticalDamages: [31, 50] } },
  helmet4: { type: 'equipment', code: 'helmet4', usage: 'helmet', skinSlot: 'helmet', rarity: 'epic', iconImg: 'helmet.png', dynamicStats: { criticalDamages: [71, 90] } },
  helmet5: { type: 'equipment', code: 'helmet5', usage: 'helmet', skinSlot: 'helmet', rarity: 'legendary', iconImg: 'helmet.png', dynamicStats: { criticalDamages: [91, 110] } },
  helmet6: { type: 'equipment', code: 'helmet6', usage: 'helmet', skinSlot: 'helmet', rarity: 'mythic', iconImg: 'helmet.png', dynamicStats: { criticalDamages: [121, 150] } },
  chest1: { type: 'equipment', code: 'chest1', usage: 'chest', skinSlot: 'chest', rarity: 'common', iconImg: 'chest.png', dynamicStats: { armor: [1, 5] } },
  chest2: { type: 'equipment', code: 'chest2', usage: 'chest', skinSlot: 'chest', rarity: 'uncommon', iconImg: 'chest.png', dynamicStats: { armor: [6, 10] } },
  chest3: { type: 'equipment', code: 'chest3', usage: 'chest', skinSlot: 'chest', rarity: 'rare', iconImg: 'chest.png', dynamicStats: { armor: [11, 15] } },
  chest4: { type: 'equipment', code: 'chest4', usage: 'chest', skinSlot: 'chest', rarity: 'epic', iconImg: 'chest.png', dynamicStats: { armor: [21, 30] } },
  chest5: { type: 'equipment', code: 'chest5', usage: 'chest', skinSlot: 'chest', rarity: 'legendary', iconImg: 'chest.png', dynamicStats: { armor: [36, 50] } },
  chest6: { type: 'equipment', code: 'chest6', usage: 'chest', skinSlot: 'chest', rarity: 'mythic', iconImg: 'chest.png', dynamicStats: { armor: [56, 70] } },
  boots1: { type: 'equipment', code: 'boots1', usage: 'boots', skinSlot: 'boots', rarity: 'common', iconImg: 'boots.png', dynamicStats: { dodge: [1, 5] } },
  boots2: { type: 'equipment', code: 'boots2', usage: 'boots', skinSlot: 'boots', rarity: 'uncommon', iconImg: 'boots.png', dynamicStats: { dodge: [6, 10] } },
  boots3: { type: 'equipment', code: 'boots3', usage: 'boots', skinSlot: 'boots', rarity: 'rare', iconImg: 'boots.png', dynamicStats: { dodge: [11, 15] } },
  boots4: { type: 'equipment', code: 'boots4', usage: 'boots', skinSlot: 'boots', rarity: 'epic', iconImg: 'boots.png', dynamicStats: { dodge: [21, 25] } },
  boots5: { type: 'equipment', code: 'boots5', usage: 'boots', skinSlot: 'boots', rarity: 'legendary', iconImg: 'boots.png', dynamicStats: { dodge: [31, 40] } },
  boots6: { type: 'equipment', code: 'boots6', usage: 'boots', skinSlot: 'boots', rarity: 'mythic', iconImg: 'boots.png', dynamicStats: { dodge: [51, 60] } },
  gloves1: { type: 'equipment', code: 'gloves1', usage: 'gloves', skinSlot: 'gloves', rarity: 'common', iconImg: 'gloves.png', dynamicStats: { precision: [1, 5] } },
  gloves2: { type: 'equipment', code: 'gloves2', usage: 'gloves', skinSlot: 'gloves', rarity: 'uncommon', iconImg: 'gloves.png', dynamicStats: { precision: [6, 10] } },
  gloves3: { type: 'equipment', code: 'gloves3', usage: 'gloves', skinSlot: 'gloves', rarity: 'rare', iconImg: 'gloves.png', dynamicStats: { precision: [11, 15] } },
  gloves4: { type: 'equipment', code: 'gloves4', usage: 'gloves', skinSlot: 'gloves', rarity: 'epic', iconImg: 'gloves.png', dynamicStats: { precision: [21, 25] } },
  gloves5: { type: 'equipment', code: 'gloves5', usage: 'gloves', skinSlot: 'gloves', rarity: 'legendary', iconImg: 'gloves.png', dynamicStats: { precision: [31, 40] } },
  gloves6: { type: 'equipment', code: 'gloves6', usage: 'gloves', skinSlot: 'gloves', rarity: 'mythic', iconImg: 'gloves.png', dynamicStats: { precision: [51, 60] } },
  pants1: { usage: 'pants', type: 'equipment', code: 'pants1', skinSlot: 'pants', rarity: 'common', iconImg: 'pants.png', dynamicStats: { armor: [1, 5] } },
  pants2: { usage: 'pants', type: 'equipment', code: 'pants2', skinSlot: 'pants', rarity: 'uncommon', iconImg: 'pants.png', dynamicStats: { armor: [6, 10] } },
  pants3: { usage: 'pants', type: 'equipment', code: 'pants3', skinSlot: 'pants', rarity: 'rare', iconImg: 'pants.png', dynamicStats: { armor: [11, 15] } },
  pants4: { usage: 'pants', type: 'equipment', code: 'pants4', skinSlot: 'pants', rarity: 'epic', iconImg: 'pants.png', dynamicStats: { armor: [21, 30] } },
  pants5: { usage: 'pants', type: 'equipment', code: 'pants5', skinSlot: 'pants', rarity: 'legendary', iconImg: 'pants.png', dynamicStats: { armor: [36, 50] } },
  pants6: { usage: 'pants', type: 'equipment', code: 'pants6', skinSlot: 'pants', rarity: 'mythic', iconImg: 'pants.png', dynamicStats: { armor: [56, 70] } },
};

export const GAME_CONFIG_ITEM_CODES = Object.keys(GAME_CONFIG_ITEMS);