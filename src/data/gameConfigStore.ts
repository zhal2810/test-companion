import { useEffect, useSyncExternalStore } from 'react';
import { GameItem } from '../types';
import { GAME_CONFIG_ITEMS, RawGameItem } from './gameConfigSnapshot';

// Nama tampilan ramah - sesuai warera.realmarijn.nl/market (Rare Helmet bukan helmet3)
export const ITEM_NAMES: Record<string, string> = {
  // Raw
  limestone: 'Limestone', grain: 'Grain', livestock: 'Livestock', fish: 'Fish', iron: 'Iron',
  coca: 'Mysterious Plant', lead: 'Lead', petroleum: 'Petroleum', wood: 'Wood',
  // Products
  concrete: 'Concrete', steel: 'Steel', bread: 'Bread', steak: 'Steak', cookedFish: 'Cooked Fish',
  lightAmmo: 'Light Ammo', ammo: 'Ammo', cocain: 'Pill', oil: 'Oil', paper: 'Paper',
  heavyAmmo: 'Heavy Ammo', scraps: 'Scraps',
  // Weapons
  knife: 'Knife', gun: 'Gun', rifle: 'Rifle', sniper: 'Sniper', tank: 'Tank', jet: 'Jet',
  // Cases
  case1: 'Normal Case', case2: 'Elite Case',
  // Equipment - rarity prefix biar helmet3 = Rare Helmet
  helmet1: 'Common Helmet', helmet2: 'Uncommon Helmet', helmet3: 'Rare Helmet', helmet4: 'Epic Helmet',
  helmet5: 'Legendary Helmet', helmet6: 'Mythic Helmet',
  chest1: 'Common Chest', chest2: 'Uncommon Chest', chest3: 'Rare Chest', chest4: 'Epic Chest',
  chest5: 'Legendary Chest', chest6: 'Mythic Chest',
  boots1: 'Common Boots', boots2: 'Uncommon Boots', boots3: 'Rare Boots', boots4: 'Epic Boots',
  boots5: 'Legendary Boots', boots6: 'Mythic Boots',
  gloves1: 'Common Gloves', gloves2: 'Uncommon Gloves', gloves3: 'Rare Gloves', gloves4: 'Epic Gloves',
  gloves5: 'Legendary Gloves', gloves6: 'Mythic Gloves',
  pants1: 'Common Pants', pants2: 'Uncommon Pants', pants3: 'Rare Pants', pants4: 'Epic Pants',
  pants5: 'Legendary Pants', pants6: 'Mythic Pants',
};

// Nama fallback dari kode bila tidak ada di ITEM_NAMES.
function deriveName(code: string): string {
  return code
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function normalizeRawItem(code: string, raw: RawGameItem): GameItem {
  const item: GameItem = {
    code,
    name: ITEM_NAMES[code] ?? deriveName(code),
    type: (['raw', 'product', 'weapon', 'equipment', 'case'].includes(raw.type) ? raw.type : 'product') as GameItem['type'],
    rarity: raw.rarity ?? 'common',
    productionPoints: raw.productionPoints ?? 0,
  };
  if (raw.productionNeeds) item.productionNeeds = raw.productionNeeds;
  if (raw.flatStats) item.flatStats = raw.flatStats;
  if (raw.dynamicStats) item.dynamicStats = raw.dynamicStats;
  if (raw.isConsumable) item.isConsumable = true;
  if (raw.isTradable) item.isTradable = true;
  if (raw.iconImg) item.iconImg = raw.iconImg;
  if (raw.usage) item.usage = raw.usage;
  if (raw.skinSlot) item.skinSlot = raw.skinSlot;
  return item;
}

export function normalizeRawItems(rawItems: Record<string, RawGameItem>): Record<string, GameItem> {
  const out: Record<string, GameItem> = {};
  Object.entries(rawItems).forEach(([code, raw]) => {
    out[code] = normalizeRawItem(code, raw);
  });
  return out;
}

// ─── Store global (module-level) ───────────────────────────────────
const bundled = normalizeRawItems(GAME_CONFIG_ITEMS);
let currentItems: Record<string, GameItem> = bundled;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

// Terapkan hasil gameConfig.getGameConfig (items) ke store global.
export function applyGameConfigItems(rawItems: Record<string, RawGameItem> | null | undefined) {
  if (!rawItems || typeof rawItems !== 'object') return;
  const normalized = normalizeRawItems(rawItems);
  currentItems = { ...normalized };
  notify();
}

// Ambil snapshot saat ini.
export function getGameItems(): Record<string, GameItem> {
  return currentItems;
}

export function getGameItem(code?: string | null): GameItem | undefined {
  if (!code) return undefined;
  return currentItems[code] ?? currentItems[code.toLowerCase()];
}

// Hook reaktif: kembalikan snapshot & re-render saat config diperbarui.
export function useGameItems(): Record<string, GameItem> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getGameItems,
    getGameItems
  );
}

export function useGameItem(code?: string | null): GameItem | undefined {
  const items = useGameItems();
  if (!code) return undefined;
  return items[code] ?? items[code.toLowerCase()];
}