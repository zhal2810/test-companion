export type ItemType = 'raw' | 'product' | 'weapon' | 'equipment' | 'case';

export interface GameItem {
  code: string;
  name: string;
  type: ItemType;
  rarity: string;
  productionPoints: number;
  productionNeeds?: Record<string, number>;
  flatStats?: Record<string, number>;
  isConsumable?: boolean;
  isTradable?: boolean;
  iconImg?: string;
}

export interface Company {
  id: string;
  name: string;
  itemCode: string;
  mode: 'manual' | 'automated' | 'both';
  manualActions: number; // how many manual actions per day
  engineLevel: number; // 0 (none) to 7
  workerCount: number; // 0 to 10
  workerActions: number; // how many actions each worker performs per day
  workerFidelity: number; // 0 to 10
  regionBonus: number; // percentage multiplier: 0, 0.25, 0.50, 1.00 etc.
}

export interface CompanyProductionResult {
  companyId: string;
  companyName: string;
  itemCode: string;
  itemType: ItemType;
  productionPoints: number;
  producedQty: number;
  inputsNeeded: { itemCode: string; qty: number }[];
}

export interface SupplyChainNode {
  itemCode: string;
  produced: number;
  consumed: number;
  net: number;
  sources: { companyId: string; qty: number }[];
  consumers: { companyId: string; qty: number }[];
  isDeficit: boolean;
  deficitQty: number;
}

export interface GlobalSettings {
  productionSkillLevel: number; // 0 to 10
  globalWorkerFidelity: number; // 0 to 10
  globalRegionBonus: number; // e.g. 0.25 for +25%
}

export interface MaterialCostLine {
  itemCode: string;
  qty: number;         // total qty needed for this input
  internalQty: number;  // portion supplied internally for free (from own/other companies)
  marketQty: number;    // portion that must be bought from market
  cost: number;          // marketQty * price
}

export interface CompanyFinancials {
  companyId: string;
  itemCode: string;
  price: number;
  soldQty: number;         // portion of own output actually sold (not consumed internally by other companies)
  usedInternallyQty: number; // portion of own output consumed internally by other companies (not sold)
  grossRevenue: number;      // soldQty * price
  materialBreakdown: MaterialCostLine[];
  materialCost: number;       // sum of materialBreakdown[].cost
  netIncome: number;           // grossRevenue - materialCost
}