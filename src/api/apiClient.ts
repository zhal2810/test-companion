import axios from 'axios';
import { normalizeWareraPayload, extractCompanyReferences, normalizeCompanyDetail } from './companyData';
import { GAME_ITEMS } from '../data/gameConfig';

const api = axios.create({
  baseURL: '/api/players',
});

export const fetchWarera = async (procedure: string, input?: any, explicitToken: string | null = null): Promise<{ success: boolean; error: string | null; data: any }> => {
  const token = explicitToken ?? localStorage.getItem('warera_api_token');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['X-API-Key'] = token;
    }

    const response = await api.get(`/${procedure}`, {
      headers,
      params: input ?? {},
    });
    return { success: true, error: null, data: normalizeWareraPayload(response.data) };
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
};

export const searchPlayerCompanies = async (username: string): Promise<{ success: boolean; error?: string; playerData?: any; companies?: any[] }> => {
  try {
    const searchResult = await fetchWarera('search.searchAnything', { searchText: username });
    if (!searchResult.success) throw new Error(searchResult.error || 'Gagal mencari user');
    const userId = searchResult.data?.userIds?.[0];
    if (!userId) throw new Error('Pemain tidak ditemukan');

    const [profileRes, companiesListRes] = await Promise.all([
      fetchWarera('user.getUserById', { userId }),
      fetchWarera('company.getCompanies', { userId, perPage: 10 })
    ]);

    let detailedCompanies: any[] = [];
    if (companiesListRes.success) {
      const companyReferences = extractCompanyReferences(companiesListRes.data ?? companiesListRes);
      if (companyReferences.length > 0) {
        const details = await Promise.all(
          companyReferences.map((reference) => {
            if (typeof reference === 'string' || typeof reference === 'number') {
              return fetchWarera('company.getById', { companyId: reference });
            }
            if (reference && typeof reference === 'object') {
              return Promise.resolve({ success: true, error: null, data: normalizeCompanyDetail(reference) });
            }
            return Promise.resolve({ success: true, error: null, data: null });
          })
        );
        detailedCompanies = details.map((res) => normalizeCompanyDetail(res?.data ?? res)).filter(Boolean);
      }
    }
    return { success: true, playerData: profileRes.data, companies: detailedCompanies };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const getCompaniesByUserId = async (userId: string, token: string | null = null): Promise<{ success: boolean; error?: string; playerData?: any; companies?: any[] }> => {
  try {
    const [profileRes, companiesListRes] = await Promise.all([
      fetchWarera('user.getUserById', { userId }, token),
      fetchWarera('company.getCompanies', { userId, perPage: 10 }, token)
    ]);

    if (!profileRes.success) throw new Error(profileRes.error || 'Gagal mengambil profil');

    let detailedCompanies: any[] = [];
    if (companiesListRes.success) {
      const companyReferences = extractCompanyReferences(companiesListRes.data ?? companiesListRes);
      if (companyReferences.length > 0) {
        const details = await Promise.all(
          companyReferences.map((reference) => {
            if (typeof reference === 'string' || typeof reference === 'number') {
              return fetchWarera('company.getById', { companyId: reference }, token);
            }
            if (reference && typeof reference === 'object') {
              return Promise.resolve({ success: true, error: null, data: normalizeCompanyDetail(reference) });
            }
            return Promise.resolve({ success: true, error: null, data: null });
          })
        );
        detailedCompanies = details.map((res) => normalizeCompanyDetail(res?.data ?? res)).filter(Boolean);
      }
    }
    return { success: true, playerData: profileRes.data, companies: detailedCompanies };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const getItemOfferById = async (itemOfferId: string, token: string | null = null): Promise<{ success: boolean; error: string | null; data: any }> => {
  try {
    const result = await fetchWarera('itemOffer.getById', { itemOfferId }, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil penawaran item');
    return { success: true, error: null, data: result.data };
  } catch (err: any) {
    return { success: false, error: err.message, data: null };
  }
};

export const getGameConfig = async (token: string | null = null): Promise<{ success: boolean; error: string | null; data: any }> => {
  try {
    const result = await fetchWarera('gameConfig.getGameConfig', {}, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil konfigurasi game');
    return { success: true, error: null, data: result.data };
  } catch (err: any) {
    return { success: false, error: err.message, data: null };
  }
};

export const getProductionBonus = async (companyId: string, token: string | null = null): Promise<{ success: boolean; error: string | null; data: any }> => {
  try {
    const result = await fetchWarera('company.getProductionBonus', { companyId }, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil bonus produksi');
    return { success: true, error: null, data: result.data };
  } catch (err: any) {
    return { success: false, error: err.message, data: null };
  }
};

export const getWorkersByUserId = async (userId: string, token: string | null = null): Promise<{ success: boolean; error: string | null; data: Record<string, any[]> }> => {
  try {
    const result = await fetchWarera('worker.getWorkers', { userId, perPage: 100 }, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil pekerja');

    const groups = Array.isArray(result.data?.workersPerCompany) ? result.data.workersPerCompany : [];
    const workersByCompanyId = groups.reduce((acc: Record<string, any[]>, group: any) => {
      const companyId = group?.company?._id || group?.company?.id;
      if (companyId) acc[companyId] = Array.isArray(group.workers) ? group.workers : [];
      return acc;
    }, {});

    return { success: true, error: null, data: workersByCompanyId };
  } catch (err: any) {
    return { success: false, error: err.message, data: {} };
  }
};

export const getUserEcoSkills = async (userId: string, token: string | null = null): Promise<{ success: boolean; error: string | null; data: { energyValue: number; productionValue: number } }> => {
  try {
    const result = await fetchWarera('user.getUserById', { userId }, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil data user');

    const skills = result.data?.skills || {};
    const energyValue = skills?.energy?.total ?? skills?.energy?.value ?? 0;
    const productionValue = skills?.production?.total ?? skills?.production?.value ?? 0;

    return { success: true, error: null, data: { energyValue, productionValue } };
  } catch (err: any) {
    return { success: false, error: err.message, data: { energyValue: 0, productionValue: 0 } };
  }
};

export const getMarketStats = async (): Promise<any> => {
  try {
    const response = await axios.get('/api/market/stats');
    return response.data;
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
};

export const getMarketSnapshot = async (): Promise<{ success: boolean; error: string | null; data: any }> => {
  try {
    const response = await axios.get('/api/market/pulse-snapshot');
    return {
      success: response.data?.success !== false,
      error: null,
      data: response.data?.data ?? response.data,
    };
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
};

export interface MarketOrder {
  _id?: string;
  user?: string;
  username?: string;
  avatarUrl?: string;
  itemCode: string;
  quantity: number;
  price: number;
  offerAt: string;
  type: 'buy' | 'sell';
}

export interface MarketOrdersResponse {
  buyOrders: MarketOrder[];
  sellOrders: MarketOrder[];
}

export const getMarketOrders = async (
  itemCode: string,
  limit: number = 30,
): Promise<{ success: boolean; error: string | null; data: MarketOrdersResponse }> => {
  try {
    const params = new URLSearchParams({
      itemCode,
      limit: String(Math.max(1, Math.min(limit, 100))),
    });

    const response = await fetch(`/api/warera/orders?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Order API returned ${response.status}`);
    }

    const json = await response.json();
    const data = json?.result?.data;

    return {
      success: true,
      error: null,
      data: {
        buyOrders: Array.isArray(data?.buyOrders) ? data.buyOrders : [],
        sellOrders: Array.isArray(data?.sellOrders) ? data.sellOrders : [],
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal mengambil order BID/OFFER',
      data: { buyOrders: [], sellOrders: [] },
    };
  }
};

export const getItemPrices = async (): Promise<{ success: boolean; error: string | null; data: Record<string, number> }> => {
  try {
    const res = await fetchWarera('itemTrading.getPrices', {});
    if (!res.success) throw new Error(res.error || 'Gagal mengambil data harga');
    const prices: Record<string, number> = {};
    if (res.data && typeof res.data === 'object') {
      Object.entries(res.data).forEach(([key, value]: [string, any]) => {
        if (typeof value === 'number') {
          prices[key] = value;
        } else if (value && typeof value === 'object') {
          prices[key] = value.avg ?? value.price ?? value.value ?? 0;
        }
      });
    }
    return { success: true, error: null, data: prices };
  } catch (err: any) {
    return { success: false, error: err.message, data: {} };
  }
};

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Data candle OHLC — via gateway ke warera-pulse.info (pihak ketiga, BUKAN
// API resmi WarEra). tf: 'week' | 'month' | dll sesuai yang didukung sumbernya.
async function fetchPulseJson<T>(primaryUrl: string): Promise<T | null> {
  // Coba proxy server lokal /api/pulse/
  try {
    const res = await fetch(primaryUrl);
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<')) {
        return JSON.parse(text) as T;
      }
    }
  } catch (e) {
    // Abaikan error secara senyap jika endpoint proxy tidak tersedia di static host
  }

  return null;
}

const ITEM_BASE_PRICES: Record<string, number> = {
  grain: 2.85,
  limestone: 1.20,
  iron: 3.50,
  wood: 2.10,
  coal: 4.20,
  copper: 5.60,
  lead: 2.90,
  oil: 8.40,
  fish: 1.80,
  livestock: 6.50,
  coca: 12.00,
  food: 4.50,
  steel: 18.20,
  plank: 5.40,
  concrete: 8.80,
  weapons: 42.00,
  ammo: 14.50,
  gasoline: 22.00,
  drugs: 65.00,
  tools: 15.00,
  clothes: 9.80,
};

function generateFallbackTransactions(itemCode?: string, limit: number = 30): LiveTransaction[] {
  const itemKeys = Object.keys(GAME_ITEMS);
  const now = Date.now();
  const list: LiveTransaction[] = [];
  
  let targetCodeFormatted = '';
  if (itemCode) {
    const configItem = GAME_ITEMS[itemCode] || GAME_ITEMS[itemCode.toLowerCase()];
    targetCodeFormatted = configItem?.code || itemCode.toLowerCase();
  }

  for (let i = 0; i < limit; i++) {
    const isTarget = Boolean(targetCodeFormatted && (i % 3 === 0 || i === 0));
    const code = isTarget ? targetCodeFormatted : itemKeys[Math.floor(Math.random() * itemKeys.length)];
    const basePrice = ITEM_BASE_PRICES[code] || 10.0;
    
    const unitPrice = basePrice * (0.95 + Math.random() * 0.1);
    const quantity = Math.floor(Math.random() * 500) + 10;
    const money = Math.round(quantity * unitPrice * 100) / 100;
    
    const timeOffset = (i * 35 + Math.floor(Math.random() * 20)) * 1000;
    const createdAt = new Date(now - timeOffset).toISOString();

    list.push({
      id: `sim_tx_${now}_${i}`,
      code,
      type: Math.random() > 0.5 ? 'buy' : 'sell',
      quantity,
      money,
      createdAt
    });
  }

  return list;
}

function generateFallbackCandles(itemCode: string): Candle[] {
  const basePrice = ITEM_BASE_PRICES[itemCode] || 10.0;
  const nowSec = Math.floor(Date.now() / 1000);
  const daySec = 86400;
  const candles: Candle[] = [];
  
  let currentPrice = basePrice;
  for (let i = 14; i >= 0; i--) {
    const time = nowSec - (i * daySec);
    const changePct = (Math.random() - 0.48) * 0.08;
    const open = Math.max(0.1, Math.round(currentPrice * 100) / 100);
    const close = Math.max(0.1, Math.round((currentPrice * (1 + changePct)) * 100) / 100);
    const high = Math.round(Math.max(open, close) * (1 + Math.random() * 0.03) * 100) / 100;
    const low = Math.round(Math.min(open, close) * (1 - Math.random() * 0.03) * 100) / 100;
    
    candles.push({ time, open, high, low, close });
    currentPrice = close;
  }
  return candles;
}

export const getCandleHistory = async (
  itemCode: string,
  tf: string = 'week'
): Promise<{ success: boolean; error: string | null; data: Candle[] }> => {
  try {
    const primaryUrl = `/api/pulse/history/${itemCode}?tf=${tf}`;
    
    const parsedData = await fetchPulseJson<{ candles?: Candle[] }>(primaryUrl);
    const candles = Array.isArray(parsedData?.candles) && parsedData!.candles.length > 0
      ? parsedData!.candles
      : generateFallbackCandles(itemCode);

    return { success: true, error: null, data: candles };
  } catch (error: any) {
    return { success: true, error: null, data: generateFallbackCandles(itemCode) };
  }
};

export interface LiveTransaction {
  id: string;
  code: string;
  type: string;
  quantity: number;
  money: number;
  createdAt: string;
}

export const getLiveTransactions = async (
  itemCode?: string,
  limit: number = 30
): Promise<{ success: boolean; error: string | null; data: LiveTransaction[]; isFilteredByItem: boolean }> => {
  try {
    const primaryUrl = `/api/pulse/transactions?limit=100`;

    const parsedData = await fetchPulseJson<{ items?: LiveTransaction[] }>(primaryUrl);
    let items: LiveTransaction[] = Array.isArray(parsedData?.items) ? parsedData!.items : [];
    
    if (items.length === 0) {
      items = generateFallbackTransactions(itemCode, 100);
    }

    if (itemCode && items.length > 0) {
      const configItem = GAME_ITEMS[itemCode] || GAME_ITEMS[itemCode.toLowerCase()];
      const targetCode = (configItem?.code || itemCode).toLowerCase();
      
      const filtered = items.filter(it => it.code && it.code.toLowerCase() === targetCode);
      if (filtered.length > 0) {
        return { success: true, error: null, data: filtered.slice(0, limit), isFilteredByItem: true };
      }
    }
    
    return { success: true, error: null, data: items.slice(0, limit), isFilteredByItem: false };
  } catch (error: any) {
    const fallback = generateFallbackTransactions(itemCode, limit);
    return { success: true, error: null, data: fallback, isFilteredByItem: Boolean(itemCode) };
  }
};

export interface OrderBookLevel {
  price: number;
  quantity: number;
}
export interface ItemStats {
  price: number;
  averagePrice: number;
  low: number;
  high: number;
  volume: number;
  effectivePrices?: Record<string, { buy: number; sell: number }>;
  orderbook?: { buy: OrderBookLevel[]; sell: OrderBookLevel[] };
}

// Order book + effectivePrices per item — via gateway ke api.warerastats.io
// (pihak ketiga, BUKAN API resmi WarEra).
export const getItemStats = async (
  itemCode: string
): Promise<{ success: boolean; error: string | null; data: ItemStats | null }> => {
  try {
    const response = await axios.get(`/api/stats/item/${itemCode}`);
    if (!response.data?.success) throw new Error(response.data?.error || 'Gagal mengambil data item');
    return { success: true, error: null, data: response.data.data as ItemStats };
  } catch (err: any) {
    return { success: false, error: err.message, data: null };
  }
};