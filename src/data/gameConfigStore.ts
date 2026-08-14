import { useEffect, useSyncExternalStore } from 'react';
import { GameItem } from '../types';
import { GAME_CONFIG_ITEMS, RawGameItem } from './gameConfigSnapshot';

// Nama tampilan ramah (API hanya menyediakan kode item, tanpa nama publik).
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
  case1: 'Case (Legendary)', case2: 'Case (Mythic)',
  // Equipment
  helmet1: 'Helmet I', helmet2: 'Helmet II', helmet3: 'Helmet III', helmet4: 'Helmet IV',
  helmet5: 'Helmet V', helmet6: 'Helmet VI',
  chest1: 'Chest I', chest2: 'Chest II', chest3: 'Chest III', chest4: 'Chest IV',
  chest5: 'Chest V', chest6: 'Chest VI',
  boots1: 'Boots I', boots2: 'Boots II', boots3: 'Boots III', boots4: 'Boots IV',
  boots5: 'Boots V', boots6: 'Boots VI',
  gloves1: 'Gloves I', gloves2: 'Gloves II', gloves3: 'Gloves III', gloves4: 'Gloves IV',
  gloves5: 'Gloves V', gloves6: 'Gloves VI',
  pants1: 'Pants I', pants2: 'Pants II', pants3: 'Pants III', pants4: 'Pants IV',
  pants5: 'Pants V', pants6: 'Pants VI',
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