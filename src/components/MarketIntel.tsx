import React, { useState, useEffect } from 'react';
import { fetchWarera, getMarketStats } from '../api/apiClient';
import { TrendingUp, TrendingDown, ArrowUpDown, RefreshCw, AlertCircle, ShoppingCart, Tag } from 'lucide-react';
import ItemIcon from './ItemIcon';
import PriceChartModal from './PriceChartModal';

function formatItemName(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

function formatVolume(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';

  const rounded = Math.round(num);
  return rounded.toLocaleString('id-ID');
}

function getNumericValue(value: any): number | null {
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function buildOrderSummary(order: any, kind: 'buy' | 'sell'): { price: number | null; quantity: number | null } | null {
  if (!order || typeof order !== 'object') return null;

  const normalizedKind = kind.toLowerCase();
  const side = String(order.side ?? order.type ?? order.orderType ?? order.kind ?? order.direction ?? '').toLowerCase();
  const matchesKind = !side || side.includes(normalizedKind) || 
    (normalizedKind === 'buy' && (side.includes('bid') || side.includes('buy'))) || 
    (normalizedKind === 'sell' && (side.includes('ask') || side.includes('sell')));

  if (!matchesKind) return null;

  const price = getNumericValue(order.price ?? order.unitPrice ?? order.avg ?? order.value ?? order.cost ?? order.buyPrice ?? order.sellPrice);
  const quantity = getNumericValue(order.quantity ?? order.amount ?? order.qty ?? order.size ?? order.count ?? order.volume ?? order.units);

  if (price === null && quantity === null) return null;

  return {
    price,
    quantity,
  };
}

function extractTopOrder(payload: any, kind: 'buy' | 'sell'): string {
  const list: any[] = [];
  const push = (value: any) => {
    if (Array.isArray(value)) {
      list.push(...value);
    } else if (value && typeof value === 'object') {
      list.push(value);
    }
  };

  if (Array.isArray(payload)) {
    list.push(...payload);
  } else if (payload && typeof payload === 'object') {
    push(payload.orders);
    push(payload.buyOrders);
    push(payload.sellOrders);
    push(payload.bids);
    push(payload.asks);
    push(payload.data);
    push(payload.items);
    push(payload.results);
    if (payload[0] && typeof payload[0] === 'object') {
      Object.values(payload).forEach(push);
    }
  }

  const summaries = list
    .map((entry) => buildOrderSummary(entry, kind))
    .filter(Boolean) as { price: number; quantity: number }[];
    
  summaries.sort((a, b) => {
    const left = a.price ?? 0;
    const right = b.price ?? 0;
    return kind === 'buy' ? right - left : left - right;
  });

  if (!summaries.length) return '—';

  const first = summaries[0];
  const priceText = first.price === null ? '—' : first.price.toFixed(2);
  const qtyText = first.quantity === null ? '—' : formatVolume(first.quantity);
  return `${priceText} × ${qtyText}`;
}

function resolveChangeValue(statsEntry: any, candidates: string[], fallback: number | null = null, range: string = 'all'): number | null {
  if (!statsEntry || typeof statsEntry !== 'object') {
    return fallback;
  }

  for (const key of candidates) {
    const raw = statsEntry[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isNaN(value)) {
      return value;
    }
  }

  // Filter out any 0, null, negative, or invalid data points representing empty trade intervals
  const rawPoints = Array.isArray(statsEntry.points) ? statsEntry.points : null;
  const points = rawPoints
    ? rawPoints.map(Number).filter((p) => !Number.isNaN(p) && p > 0)
    : null;

  if (points && points.length > 1) {
    const lastPoint = points[points.length - 1];
    const targetWindow = ({
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30,
      '90d': 24 * 90,
      all: 0,
    } as Record<string, number>)[range] ?? 0;

    const baselineIndex = Math.max(0, points.length - 1 - targetWindow);
    const baselinePoint = points[baselineIndex];

    if (baselinePoint > 0 && lastPoint > 0) {
      return ((lastPoint - baselinePoint) / baselinePoint) * 100;
    }
  }

  return fallback;
}

interface PriceEntry {
  item: string;
  name: string;
  price: number;
  changeValue: number;
  change: string;
  changeByRange: {
    all: number;
    '24h': number | null;
    '7d': number | null;
    '30d': number | null;
    '90d': number | null;
  };
  volumeValue: number;
  volume: any;
  topBuy?: string;
  topSell?: string;
  offerText?: string | null;
}

function normalizePrices(data: any, previousPrices: Record<string, number> = {}, statsMap: Record<string, any> = {}): PriceEntry[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const entries = Object.entries(data).map(([key, value]: [string, any]) => {
      const baseName = formatItemName(key);
      let price: number = 0;
      let volume: any = '—';
      let changeValue: number = 0;
      let change: string = '—';
      let changeByRange = {
        all: 0,
        '24h': null as number | null,
        '7d': null as number | null,
        '30d': null as number | null,
        '90d': null as number | null,
      };

      const statsEntry = statsMap[key] || statsMap[key.toLowerCase()] || null;

      if (typeof value === 'number') {
        price = value;
      } else if (value && typeof value === 'object') {
        price = value.avg ?? value.price ?? value.value ?? 0;
        volume = value.vol ?? value.volume ?? '—';
        const rawChange = value.change ?? value.trend;
        if (rawChange !== undefined && rawChange !== null && rawChange !== '') {
          changeValue = Number(rawChange) || 0;
          change = formatChange(changeValue);
        }
      }

      if (statsEntry) {
        const statsPrice = Number(statsEntry.avg ?? statsEntry.price ?? statsEntry.value ?? price) || 0;
        const statsVolume = statsEntry.vol ?? statsEntry.volume ?? volume;
        const statsChange = statsEntry.change ?? statsEntry.trend;

        if (statsPrice > 0) {
          price = statsPrice;
        }
        if (statsVolume !== undefined && statsVolume !== null && statsVolume !== '') {
          volume = statsVolume;
        }
        if (statsChange !== undefined && statsChange !== null && statsChange !== '') {
          changeValue = Number(statsChange) || 0;
          change = formatChange(changeValue);
        }
      }

      const overallChange = Number(statsEntry?.change ?? statsEntry?.trend ?? changeValue) || 0;
      changeValue = overallChange;
      change = formatChange(changeValue);

      changeByRange = {
        all: overallChange,
        '24h': resolveChangeValue(statsEntry, ['change24h', 'change24', 'change24H', 'change1d', 'changeDay'], overallChange, '24h'),
        '7d': resolveChangeValue(statsEntry, ['change7d', 'change7D', 'change7', 'changeWeek'], overallChange, '7d'),
        '30d': resolveChangeValue(statsEntry, ['change30d', 'change30D', 'change30', 'change1m', 'change1M'], overallChange, '30d'),
        '90d': resolveChangeValue(statsEntry, ['change90d', 'change90D', 'change90', 'change3m', 'change3M'], overallChange, '90d'),
      };

      const numericPrice = Number(price) || 0;
      const previousPrice = Number(previousPrices[key]) || 0;

      if (change === '—' && previousPrice > 0 && numericPrice > 0) {
        changeValue = ((numericPrice - previousPrice) / previousPrice) * 100;
        change = formatChange(changeValue);
      } else if (change === '—' && previousPrice === 0 && numericPrice > 0) {
        changeValue = 0;
        change = '—';
      }

      return {
        item: key,
        name: typeof value === 'object' && value && value.name ? value.name : baseName,
        price: numericPrice,
        changeValue,
        change,
        changeByRange,
        volumeValue: Number(volume) || 0,
        volume,
      };
    }).filter(Boolean);

    return entries;
  }
  return [];
}

interface MarketIntelProps {
  token: string | null;
}

export default function MarketIntel({ token }: MarketIntelProps) {
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'volume' | 'price' | 'change' | 'name'>('price');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [changeRange, setChangeRange] = useState<'24h' | '7d' | '30d' | '90d' | 'all'>('24h');
  const [selectedItem, setSelectedItem] = useState<PriceEntry | null>(null);

  const loadMarketData = async () => {
    setLoading(true);
    try {
      const previousSnapshot = (() => {
        try {
          return JSON.parse(localStorage.getItem('warera_market_previous') || '{}');
        } catch {
          return {};
        }
      })();

      const [wareraRes, statsRes] = await Promise.all([
        fetchWarera('itemTrading.getPrices', {}),
        getMarketStats().catch(() => null)
      ]);

      const statsMap: Record<string, any> = {};
      if (statsRes?.success && Array.isArray(statsRes.data)) {
        statsRes.data.forEach((item: any) => {
          statsMap[item.itemCode] = item;
        });
      }

      let rawPrices = (wareraRes.success && wareraRes.data) ? wareraRes.data : null;

      // If the live API is offline, empty, or fails, we fall back to local JSON stats data
      if (!rawPrices || Object.keys(rawPrices).length === 0) {
        console.warn("Live itemTrading.getPrices API failed or returned empty data; falling back to local stats json data.");
        const fallbackObj: Record<string, any> = {};
        if (statsRes?.success && Array.isArray(statsRes.data)) {
          statsRes.data.forEach((item: any) => {
            fallbackObj[item.itemCode] = {
              avg: item.avg,
              vol: item.vol,
              change: item.change,
            };
          });
        }
        rawPrices = fallbackObj;
      }

      const normalized = normalizePrices(rawPrices, previousSnapshot, statsMap);

      const enriched = await Promise.all(normalized.map(async (entry) => {
        try {
          const orderRes = await fetchWarera('tradingOrder.getTopOrders', { itemCode: entry.item, limit: 3 }, token);
          const payload = orderRes?.success ? orderRes.data : null;

          return {
            ...entry,
            topBuy: extractTopOrder(payload, 'buy'),
            topSell: extractTopOrder(payload, 'sell'),
            offerText: null,
          };
        } catch {
          return entry;
        }
      }));

      setPrices(enriched);

      try {
        const nextSnapshot = Object.fromEntries(
          enriched.map((entry) => [entry.item, Number(entry.price)])
        );
        localStorage.setItem('warera_market_previous', JSON.stringify(nextSnapshot));
      } catch {
        // ignore
      }
    } catch (e) {
      console.error('Failed to load market intelligence data', e);
      setPrices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarketData();
  }, [token]);

  const priceEntries = Array.isArray(prices) ? [...prices] : [];

  const getDisplayChangeValue = (entry: PriceEntry) => {
    const value = entry?.changeByRange?.[changeRange];
    return value === null || value === undefined ? entry?.changeValue ?? 0 : Number(value);
  };

  const sortedEntries = [...priceEntries].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'volume':
        comparison = (b.volumeValue || 0) - (a.volumeValue || 0);
        break;
      case 'price':
        comparison = Number(b.price) - Number(a.price);
        break;
      case 'change':
        comparison = (getDisplayChangeValue(b) || 0) - (getDisplayChangeValue(a) || 0);
        break;
      case 'name':
        comparison = String(a.name).localeCompare(String(b.name));
        break;
      default:
        comparison = 0;
    }

    return sortDirection === 'desc' ? comparison : -comparison;
  });

  const getChangeBadgeClasses = (value: number) => {
    if (value > 0) return 'text-emerald-400 bg-emerald-950/25 border-emerald-500/20';
    if (value < 0) return 'text-rose-400 bg-rose-950/25 border-rose-500/20';
    return 'text-amber-400 bg-amber-950/25 border-amber-500/20';
  };

  return (
    <div className="bg-[#10121A]/80 backdrop-blur-md border border-slate-800/80 rounded-xl p-5 md:p-6 text-slate-100 shadow-xl">
      
      {/* TITLE & DESCRIPTION */}
      <div className="flex justify-between items-start gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold tracking-tight text-white uppercase">
              Bursa Komoditas Real-time
            </h3>
          </div>
          <p className="text-xs text-slate-500 max-w-md">
            Harga komoditas pasar global diperbarui langsung dari official server WarEra.
          </p>
        </div>
        
        <button 
          onClick={loadMarketData} 
          disabled={loading}
          className="flex items-center gap-1.5 bg-[#161924] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-sky-400 text-xs px-3 py-1.5 rounded-lg transition duration-200 cursor-pointer disabled:text-slate-600 disabled:border-slate-900"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'MEMUAT...' : 'SINKRON BURSA'}
        </button>
      </div>

      {/* FILTER & SORT CONTROLS */}
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3.5 p-3.5 bg-slate-950/30 border border-slate-800/60 rounded-xl">
        <div className="flex gap-2.5 items-center">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Interval Tren:</span>
          <select
            value={changeRange}
            onChange={(e) => setChangeRange(e.target.value as any)}
            className="bg-[#08090C] text-slate-300 border border-slate-800 hover:border-slate-700 focus:border-sky-500/40 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer outline-none transition duration-200"
          >
            <option value="24h">24 Jam</option>
            <option value="7d">7 Hari</option>
            <option value="30d">30 Hari</option>
            <option value="90d">90 Hari</option>
            <option value="all">Semua Historis</option>
          </select>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Urutan:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-[#08090C] text-slate-300 border border-slate-800 hover:border-slate-700 focus:border-sky-500/40 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer outline-none transition duration-200"
          >
            <option value="price">Harga Ticker</option>
            <option value="volume">Volume Bursa</option>
            <option value="change">Fluktuasi Persen</option>
            <option value="name">Nama Komoditas</option>
          </select>

          <select
            value={sortDirection}
            onChange={(e) => setSortDirection(e.target.value as any)}
            className="bg-[#08090C] text-slate-300 border border-slate-800 hover:border-slate-700 focus:border-sky-500/40 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer outline-none transition duration-200"
          >
            <option value="desc">↓ Tertinggi</option>
            <option value="asc">↑ Terendah</option>
          </select>
        </div>
      </div>

      {/* MARKET COMMODITIES GRID */}
      {loading && priceEntries.length === 0 ? (
        <div className="text-center py-12 text-xs text-slate-500 flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
          <span>Mengunduh data ticker pasar global...</span>
        </div>
      ) : priceEntries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sortedEntries.map((entry) => {
            const displayChangeValue = getDisplayChangeValue(entry);
            const displayChange = formatChange(displayChangeValue);

            return (
              <React.Fragment key={entry.item}>
                {/* Mobile Card Layout (visible only on mobile) */}
                <div 
                  onClick={() => setSelectedItem(entry)}
                  className="sm:hidden bg-[#0A0C12]/60 hover:bg-[#0E1018]/80 border border-slate-800 hover:border-slate-700 p-3.5 rounded-xl transition duration-200 space-y-2.5 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-center shrink-0">
                        <ItemIcon itemCode={entry.item} size="sm" />
                      </div>
                      <div className="min-w-0">
                        <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">
                          {entry.item}
                        </span>
                        <span className="text-xs font-bold text-white leading-tight block truncate">
                          {entry.name}
                        </span>
                      </div>
                    </div>
                    <span className={`text-[9.5px] font-bold font-mono py-0.5 px-2 rounded-full border ${getChangeBadgeClasses(displayChangeValue)}`}>
                      {displayChangeValue > 0 ? '▲' : displayChangeValue < 0 ? '▼' : '•'} {displayChange}
                    </span>
                  </div>
                  
                  <div className="border-t border-slate-800/40 my-1"></div>

                  <div className="grid grid-cols-3 gap-2 text-left pt-0.5">
                    <div>
                      <span className="block text-[8px] uppercase tracking-wider font-bold text-slate-400">Harga Ticker</span>
                      <span className="text-xs font-mono font-extrabold text-white">{Number(entry.price).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="block text-[8px] uppercase tracking-wider font-bold text-slate-400">Volume Bursa</span>
                      <span className="text-xs font-mono font-medium text-slate-300">{formatVolume(entry.volume)}</span>
                    </div>
                    <div>
                      <span className="block text-[8px] uppercase tracking-wider font-bold text-slate-400 font-mono">Bid/Ask</span>
                      <div className="space-y-0.5 text-[8.5px] font-mono leading-none mt-0.5">
                        <div className="text-emerald-500/80">B: {entry.topBuy || '—'}</div>
                        <div className="text-rose-400/80">S: {entry.topSell || '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desktop Card Layout (visible only on desktop) */}
                <div 
                  onClick={() => setSelectedItem(entry)}
                  className="hidden sm:flex bg-[#0A0C12]/60 hover:bg-[#0E1018]/80 border border-slate-800 hover:border-slate-700 p-4 rounded-xl items-center justify-between gap-4 transition duration-200 cursor-pointer"
                >
                  {/* ICON & NAME */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-center shrink-0">
                      <ItemIcon itemCode={entry.item} size="md" />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {entry.item}
                      </span>
                      <span className="text-sm font-bold text-white leading-tight">
                        {entry.name}
                      </span>
                      <span className="block text-[10.5px] text-slate-500 mt-1 font-mono">
                        Vol: {formatVolume(entry.volume)}
                      </span>
                    </div>
                  </div>

                  {/* TICKER PRICE & BID/ASK */}
                  <div className="text-right flex flex-col justify-between h-full py-0.5">
                    <div className="flex items-center justify-end gap-2 mb-1.5">
                      <span className="text-base font-mono font-bold text-white">
                        {Number(entry.price).toFixed(2)}
                      </span>
                      <span className={`text-[10px] font-bold font-mono py-0.5 px-2 rounded-full border ${getChangeBadgeClasses(displayChangeValue)}`}>
                        {displayChangeValue > 0 ? '▲' : displayChangeValue < 0 ? '▼' : '•'} {displayChange}
                      </span>
                    </div>

                    <div className="space-y-0.5 text-[10px] font-mono">
                      <div className="text-emerald-500/80 flex items-center justify-end gap-1">
                        <span className="text-[9px] text-slate-500">BID:</span>
                        <span>{entry.topBuy || '—'}</span>
                      </div>
                      <div className="text-rose-400/80 flex items-center justify-end gap-1">
                        <span className="text-[9px] text-slate-500">ASK:</span>
                        <span>{entry.topSell || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#12141C] border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
          <AlertCircle className="w-8 h-8 text-slate-600 mb-1" />
          <span>Gagal memuat ticker pasar. Layanan official WarEra API sedang tidak responsif atau proxy terganggu.</span>
        </div>
      )}

      {/* PRICE CHART MODAL */}
      <PriceChartModal
        isOpen={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        itemCode={selectedItem?.item ?? null}
        itemName={selectedItem?.name ?? ''}
        currentPrice={selectedItem?.price ?? 0}
        volume={selectedItem?.volume ?? 0}
        change24h={selectedItem?.changeByRange?.['24h'] ?? selectedItem?.changeValue ?? 0}
        topBuy={selectedItem?.topBuy}
        topSell={selectedItem?.topSell}
      />

    </div>
  );
}
