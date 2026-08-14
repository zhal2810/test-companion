import { GameItem } from '../types';
import { getGameItems } from './gameConfigStore';

// Data item otoritatif dari gameConfig.getGameConfig (API WarEra).
// Di-bundle lewat snapshot di gameConfigSnapshot.ts dan bisa di-refresh
// runtime lewat refreshGameConfig(token) (apiClient) / applyGameConfigItems().
//
// Proxy dipakai supaya setiap akses (termasuk Object.keys/Object.values)
// selalu membaca store terkini — komponen lama yang import GAME_ITEMS
// langsung otomatis melihat data real tanpa refactor.
export const GAME_ITEMS: Record<string, GameItem> = new Proxy({} as Record<string, GameItem>, {
  get: (_target, prop) => {
    if (typeof prop === 'string') {
      return getGameItems()[prop];
    }
    return undefined;
  },
  ownKeys: () => Reflect.ownKeys(getGameItems()),
  getOwnPropertyDescriptor: (_target, prop) => Reflect.getOwnPropertyDescriptor(getGameItems(), prop),
  has: (_target, prop) => prop in getGameItems(),
});

// Skill production values (Level 0 to 10)
export const PRODUCTION_SKILL_VALUES = [10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40];

// Automated engine daily production points (Level 1 to 7)
export const AUTOMATED_ENGINE_DAILY_PROD = [24, 48, 72, 96, 120, 144, 168];

// Storage capacities (Level 1 to 7)
export const STORAGE_CAPACITIES = [200, 400, 600, 800, 1000, 1200, 1400];