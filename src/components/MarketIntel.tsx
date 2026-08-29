import React, { useState, useEffect } from 'react';
import { fetchWarera, getMarketSnapshot, getMarketStats } from '../api/apiClient';
import { TrendingUp, TrendingDown, ArrowUpDown, RefreshCw, AlertCircle, ShoppingCart, Tag } from 'lucide-react';
import ItemIcon from './ItemIcon';
import { GAME_ITEMS } from '../data/gameConfig';
import { computeMarketSignal, DEFAULT_AVG_WAGE_PER_PP, calculateOrderBookImbalance, extractAverageWagePerPP, type TradeSignal } from '../utils/signalEngine';
import { getItemStats, getCandleHistory } from '../api/apiClient';
import { getConsistentPrice, getCacheStats, formatPrice } from '../utils/priceHelper';

const PriceChartModal = React.lazy(() => import('./PriceChartModal'));

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
  const priceText = first.price === null ? '—' : formatPrice(first.price);
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
    ? rawPoints.map(Number).filter((p: number) => !Number.isNaN(p) && p > 0)
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
  points?: number[];
  topBuy?: string;
  topSell?: string;
  offerText?: string | null;
  signal?: 'buy' | 'sell' | 'hold';
  signalReason?: string;
  marginPercent?: number | null;
  fairValue?: number | null;
  bestBid?: number | null;
  bestOffer?: number | null;
  bidVolume?: number;
  offerVolume?: number;
  imbalanceRatio?: number;
}

function normalizePrices(data: any, previousPrices: Record<string, number> = {}, statsMap: Record<string, any> = {}): PriceEntry[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const entries = Object.entries(data).map(([key, value]: [string, any]) => {
      const configItem = GAME_ITEMS[key] || GAME_ITEMS[key.toLowerCase()];
      const baseName = configItem?.name || formatItemName(key);
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

      // Hitung perubahan dari points array (Pulse Gateway) — lebih akurat
      const rawPoints = Array.isArray(statsEntry?.points) ? statsEntry.points : null;
      const cleanPoints = rawPoints
        ? rawPoints.map(Number).filter((p: number) => !Number.isNaN(p) && p > 0)
        : null;

      // Coba ambil change24h native dari Pulse dulu (paling akurat, sama dengan candle)
      const pulseChange24h = (() => {
        const candidates = ['change24h', 'change_24h', 'change24', 'change24H', 'change1d', 'changeDay', 'change'];
        for (const k of candidates) {
          const v = statsEntry?.[k];
          if (v !== undefined && v !== null && v !== '') {
            const n = Number(v);
            if (!Number.isNaN(n)) return n;
          }
        }
        return null;
      })();

      const calcChangeFromPoints = (windowHours: number): number | null => {
        if (!cleanPoints || cleanPoints.length < 2) return null;
        const last = cleanPoints[cleanPoints.length - 1];
        // Pulse points bisa berbeda interval — pakai seluruh window yang tersedia jika < windowHours
        const baseIdx = Math.max(0, cleanPoints.length - 1 - windowHours);
        const base = cleanPoints[baseIdx];
        if (base > 0 && last > 0) return ((last - base) / base) * 100;
        return null;
      };

      changeByRange = {
        all: overallChange,
        '24h': pulseChange24h ?? calcChangeFromPoints(24) ?? null,
        '7d': calcChangeFromPoints(24 * 7) ?? resolveChangeValue(statsEntry, ['change7d', 'change7D', 'change7', 'changeWeek'], null, '7d'),
        '30d': calcChangeFromPoints(24 * 30) ?? resolveChangeValue(statsEntry, ['change30d', 'change30D', 'change30', 'change1m', 'change1M'], null, '30d'),
        '90d': calcChangeFromPoints(24 * 90) ?? resolveChangeValue(statsEntry, ['change90d', 'change90D', 'change90', 'change3m', 'change3M'], null, '90d'),
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
        name: configItem?.name || (typeof value === 'object' && value && value.name ? value.name : baseName),
        price: numericPrice,
        changeValue,
        change,
        changeByRange,
        volumeValue: Number(volume) || 0,
        volume,
        points: cleanPoints ?? undefined,
      };
    }).filter(Boolean);

    return entries;
  }
  return [];
}

interface MarketIntelProps {
  token: string | null;
}

function SignalBadge({ signal }: { signal: TradeSignal }) {
  const config = {
    buy: { label: 'BUY', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    sell: { label: 'SELL', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    hold: { label: 'HOLD', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  }[signal];

  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${config.className}`}>
      {config.label}
    </span>
  );
}

export default function MarketIntel({ token }: MarketIntelProps) {
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'volume' | 'price' | 'change' | 'name'>('price');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [changeRange, setChangeRange] = useState<'24h' | '7d' | '30d' | '90d' | 'all'>('24h');
  const [selectedItem, setSelectedItem] = useState<PriceEntry | null>(null);
  const [averageWagePerPP, setAverageWagePerPP] = useState(DEFAULT_AVG_WAGE_PER_PP);

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

      const [wareraRes, statsRes, snapshotRes] = await Promise.all([
        fetchWarera('itemTrading.getPrices', {}),
        getMarketStats().catch(() => null),
        getMarketSnapshot().catch(() => null),
      ]);

      if (snapshotRes?.success) {
        setAverageWagePerPP(extractAverageWagePerPP(snapshotRes.data));
      }

      const statsMap: Record<string, any> = {};

      // Masukkan data dari Pulse snapshot dulu (sebagai base)
      // Snapshot structure: { prices:{item:price}, battles:{...}, events, ranking, wage... }
      // Jangan map battles/events sebagai item; hanya prices yang relevan untuk ticker
      if (snapshotRes?.success && snapshotRes.data && typeof snapshotRes.data === 'object') {
        const snap: any = snapshotRes.data;
        if (snap.prices && typeof snap.prices === 'object') {
          Object.entries(snap.prices).forEach(([key, val]: [string, any]) => {
            const priceNum = typeof val === 'number' ? val : Number((val as any)?.price ?? (val as any)?.avg ?? 0);
            if (Number.isFinite(priceNum) && priceNum > 0) {
              statsMap[key.toLowerCase()] = { price: priceNum, avg: priceNum, ...(typeof val === 'object' ? val : {}) };
            }
          });
        } else {
          // Fallback: kalau snapshot langsung map per-item (legacy)
          Object.entries(snap).forEach(([key, val]: [string, any]) => {
            if (val && typeof val === 'object' && !Array.isArray(val) && key !== 'battles' && key !== 'events' && key !== 'ranking' && key !== 'wage') {
              // heuristik: hanya masukkan kalau terlihat seperti item stat (ada price/avg/points/change)
              if ('price' in val || 'avg' in val || 'points' in val || 'change' in val) {
                statsMap[key.toLowerCase()] = { ...val };
              }
            }
          });
        }
      }

      // Override/merge dengan data dari WarEra stats (lebih prioritas untuk price/volume)
      if (statsRes?.success && Array.isArray(statsRes.data)) {
        statsRes.data.forEach((item: any) => {
          const k = (item.itemCode || '').toLowerCase();
          statsMap[k] = { ...(statsMap[k] || {}), ...item };
        });
      }

      const normalized = (wareraRes.success && wareraRes.data)
        ? normalizePrices(wareraRes.data, previousSnapshot, statsMap)
        : [];

      // ✅ Ensure price consistency + hitung % dari candle biar sama dengan chart
      // Grid sebelumnya 0% karena statsMap.points kosong & snapshot.prices tidak ada change
      const consistentPrices = await Promise.all(
        normalized.map(async (entry) => {
          try {
            const result = await getConsistentPrice(entry.item, entry.price);
            // Hitung change 24h/7d/30d dari candle week yang sama dipakai chart
            let candleChange24h: number | null = null;
            let candleChange7d: number | null = null;
            let candlePoints: number[] | null = null;
            try {
              const candleRes = await getCandleHistory(entry.item, 'week');
              if (candleRes.success && candleRes.data.length > 1) {
                const sorted = [...candleRes.data].sort((a,b)=> Number(a.time)-Number(b.time));
                const closes = sorted.map(c=> Number(c.close)).filter(n=> Number.isFinite(n) && n>0);
                candlePoints = closes;
                const last = sorted[sorted.length-1];
                const lastClose = Number(last.close);
                // 24h = ~24 candle 1h
                const target24h = Number(last.time) - 86400;
                let base24: any = null;
                for (let i=sorted.length-2;i>=0;i--) if (Number(sorted[i].time) <= target24h) { base24 = sorted[i]; break; }
                if (!base24) base24 = sorted[0];
                if (base24 && Number(base24.close)>0) candleChange24h = ((lastClose - Number(base24.close))/Number(base24.close))*100;
                // 7d = seluruh week (168)
                const first = sorted[0];
                if (first && Number(first.close)>0) candleChange7d = ((lastClose - Number(first.close))/Number(first.close))*100;
              }
            } catch {}
            // Merge: prioritas candle > statsMap > fallback
            const nextChangeByRange = { ...entry.changeByRange };
            if (candleChange24h !== null && Number.isFinite(candleChange24h)) {
              nextChangeByRange['24h'] = candleChange24h;
              // juga update all/7d jika masih null/0
              if (nextChangeByRange['all'] === 0) nextChangeByRange['all'] = candleChange24h;
            }
            if (candleChange7d !== null && Number.isFinite(candleChange7d) && (nextChangeByRange['7d'] === null || nextChangeByRange['7d'] === 0)) {
              nextChangeByRange['7d'] = candleChange7d;
            }
            const activeChange = nextChangeByRange['24h'] ?? nextChangeByRange['all'] ?? entry.changeValue;
            return { 
              ...entry, 
              price: result.price, 
              changeByRange: nextChangeByRange,
              changeValue: Number.isFinite(activeChange as number) ? Number(activeChange) : entry.changeValue,
              change: formatChange(Number.isFinite(activeChange as number) ? Number(activeChange) : entry.changeValue),
              points: candlePoints ?? entry.points,
            };
          } catch {
            return entry;
          }
        })
      );

    const enriched = await Promise.all(consistentPrices.map(async (entry) => {
  try {
    const orderRes = await fetchWarera('tradingOrder.getTopOrders', { itemCode: entry.item, limit: 3 }, token);
    const payload = orderRes?.success ? orderRes.data : null;

    // Fair Value + BID/OFFER + posisi harga adalah mesin utama.
    let signal: 'buy' | 'sell' | 'hold' = 'hold';
    let signalReason = 'Data tidak lengkap';
    let fairValue: number | null = null;
    let bestBid: number | null = null;
    let bestOffer: number | null = null;
    let bidVolume = 0;
    let offerVolume = 0;
    let imbalanceRatio = 1;

    try {
      let orderBook = null;
      try {
        const statsRes = await getItemStats(entry.item);
        if (statsRes.success && statsRes.data?.orderbook) {
          const buys = statsRes.data.orderbook.buy || [];
          const sells = statsRes.data.orderbook.sell || [];
          bestBid = buys.length ? Math.max(...buys.map((o: any) => Number(o.price)).filter((n: number) => Number.isFinite(n))) : null;
          bestOffer = sells.length ? Math.min(...sells.map((o: any) => Number(o.price)).filter((n: number) => Number.isFinite(n))) : null;
          const orders: Array<{ type: 'buy' | 'sell'; price: number; quantity: number }> = [];
          buys.forEach((level: any) => orders.push({ type: 'buy', price: Number(level.price), quantity: Number(level.quantity) }));
          sells.forEach((level: any) => orders.push({ type: 'sell', price: Number(level.price), quantity: Number(level.quantity) }));
          orderBook = calculateOrderBookImbalance(orders, entry.price);
          bidVolume = orderBook.bidVolume;
          offerVolume = orderBook.askVolume;
          imbalanceRatio = orderBook.imbalanceRatio;
        }
      } catch (e) {
        // Order book optional.
      }

      const pricesForEngine = Array.isArray(entry.points) && entry.points.length > 0
        ? entry.points
        : [Number(entry.price)];
      const signalResult = computeMarketSignal(
        pricesForEngine,
        Number(entry.price),
        orderBook,
        bestBid,
        bestOffer
      );
      signal = signalResult.signal;
      signalReason = signalResult.reasons[0] || 'Hold position';
      fairValue = signalResult.fairValue?.fairValue ?? null;
    } catch (e) {
      console.error('Signal calc error for', entry.item, e);
    }

    return {
      ...entry,
      topBuy: extractTopOrder(payload, 'buy'),
      topSell: extractTopOrder(payload, 'sell'),
      offerText: null,
      signal,
      signalReason,
      fairValue,
      bestBid,
      bestOffer,
      bidVolume,
      offerVolume,
      imbalanceRatio,
    };
  } catch (e) {
    console.error('Error enriching item:', entry.item, e);
    return { ...entry, signal: 'hold' };
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

  const priceMap = React.useMemo(
    () => Object.fromEntries(priceEntries.map((e) => [e.item, Number(e.price)])),
    [priceEntries]
  );

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
{/* ✅ Optional: Show cache stats for debugging */}
<div className="text-[10px] text-slate-600 text-center">
  Cache Status: {getCacheStats().hitRate}
</div>
    return sortDirection === 'desc' ? comparison : -comparison;
  });

  const getChangeBadgeClasses = (value: number) => {
    if (value > 0) return 'text-emerald-400 bg-emerald-950/25 border-emerald-500/20';
    if (value < 0) return 'text-rose-400 bg-rose-950/25 border-rose-500/20';
    return 'text-amber-400 bg-amber-950/25 border-amber-500/20';
  };

  useEffect(() => {
    if (sortedEntries.length > 0 && !selectedItem) {
      setSelectedItem(sortedEntries[0]);
    }
  }, [sortedEntries, selectedItem]);

  return (
    <div className="bg-[#10121A]/80 backdrop-blur-md border border-slate-800/80 rounded-xl p-3 md:p-4 text-slate-100 shadow-xl space-y-3">
      
      {/* HEADER TITLE & CONTROLS BAR */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold tracking-tight text-white uppercase">
              Bursa Komoditas Real-time
            </h3>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* INTERVAL TREN SELECTOR */}
          <div className="flex items-center gap-1.5 bg-[#08090C] border border-slate-800 px-2 py-1 rounded-lg">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Interval:</span>
            <select
              value={changeRange}
              onChange={(e) => setChangeRange(e.target.value as any)}
              className="bg-transparent text-slate-300 text-xs font-semibold cursor-pointer outline-none"
            >
              <option value="24h">24 Jam</option>
              <option value="7d">7 Hari</option>
              <option value="30d">30 Hari</option>
              <option value="90d">90 Hari</option>
              <option value="all">Semua Historis</option>
            </select>
          </div>

          {/* SORT SELECTOR */}
          <div className="flex items-center gap-1 bg-[#08090C] border border-slate-800 px-2 py-1 rounded-lg">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Urutan:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-slate-300 text-xs font-semibold cursor-pointer outline-none"
            >
              <option value="price">Harga Ticker</option>
              <option value="volume">Volume Bursa</option>
              <option value="change">Fluktuasi Persen</option>
              <option value="name">Nama Komoditas</option>
            </select>
            <select
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as any)}
              className="bg-transparent text-slate-300 text-xs font-semibold cursor-pointer outline-none"
            >
              <option value="desc">↓ Tertinggi</option>
              <option value="asc">↑ Terendah</option>
            </select>
          </div>

          {/* REFRESH BUTTON */}
          <button 
            onClick={loadMarketData} 
            disabled={loading}
            className="flex items-center gap-1 bg-[#161924] hover:bg-slate-800 border border-slate-800 text-sky-400 text-xs px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'MEMUAT...' : 'SINKRON'}
          </button>
        </div>
      </div>

      {/* MARKET COMMODITIES CARDS (ROW) */}
      {loading && priceEntries.length === 0 ? (
        <div className="text-center py-8 text-xs text-slate-500 flex flex-col items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-sky-500" />
          <span>Mengunduh data ticker pasar global...</span>
        </div>
      ) : priceEntries.length > 0 ? (
        <div className="space-y-3">
          {/* TOP ITEM CARDS RESPONSIVE GRID (NO SIDE SCROLL) */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Pilih Komoditas Pasar</span>
              <span className="text-[9.5px] text-slate-500 font-normal">Klik item untuk melihat Grafik Candle di bawah</span>
            </div>
            
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {sortedEntries.map((entry) => {
                const isSelected = selectedItem?.item === entry.item;
                const displayChangeValue = getDisplayChangeValue(entry);
                const displayChange = formatChange(displayChangeValue);
                const isPositive = displayChangeValue > 0;
                const isNegative = displayChangeValue < 0;

                return (
                  <div
                    key={entry.item}
                    onClick={() => setSelectedItem(entry)}
                    className={`cursor-pointer rounded-xl overflow-hidden border transition-all duration-150 select-none flex flex-col justify-between ${
                      isSelected
                        ? 'ring-2 ring-sky-400 border-sky-400 bg-sky-950/30 shadow-lg shadow-sky-500/15 scale-[1.02] z-10'
                        : 'border-slate-800/90 bg-[#0B0D14] hover:border-slate-700 hover:bg-[#0F121D]'
                    }`}
                  >
                    {/* TOP HEADER: ITEM CODE & BID/ASK */}
                    <div className="bg-[#07080E] p-2 border-b border-slate-800/60">
                      <div className="text-[11px] font-black text-white truncate tracking-wider uppercase leading-tight">
                        {entry.item}
                      </div>
                      <div className="flex justify-between items-center text-[8.5px] font-mono leading-none mt-1">
                        <span className="text-emerald-400/90 font-bold truncate">
                          <span className="text-[7.5px] text-slate-500">B</span> {entry.topBuy || '—'}
                        </span>
                        <span className="text-rose-400/90 font-bold truncate ml-1">
                          <span className="text-[7.5px] text-slate-500">A</span> {entry.topSell || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[7.5px] font-mono mt-1 text-slate-600">
                        <span>FV {entry.fairValue != null ? formatPrice(entry.fairValue) : '—'}</span>
                        <span>R {entry.imbalanceRatio != null ? (Number.isFinite(entry.imbalanceRatio) ? entry.imbalanceRatio.toFixed(2) : '∞') : '—'}</span>
                      </div>
                    </div>

                    {/* BOTTOM BODY: ASSET ICON, PERCENTAGE & TRIANGLE ARROW */}
                    <div
                      className={`p-2 flex items-center justify-between transition duration-200 ${
                        isNegative
                          ? 'bg-rose-950/25 text-rose-400'
                          : isPositive
                          ? 'bg-emerald-950/25 text-emerald-400'
                          : 'bg-slate-900/40 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                          <ItemIcon itemCode={entry.item} size="sm" className="w-full h-full object-contain" />
                        </div>
                        <span className="text-[11px] font-mono font-black tracking-tight leading-none">
                          {displayChange}
                        </span>
                      </div>

                      {/* PROMINENT INDICATOR TRIANGLE */}
                      <div className="shrink-0 pl-1">
                        {isNegative ? (
                          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[9px] border-t-rose-500" />
                        ) : isPositive ? (
                          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[9px] border-b-emerald-400" />
                        ) : (
                          <span className="text-[10px] text-slate-500">●</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* MAIN CENTER CANDLE CHART & DETAILS PANEL */}
          {selectedItem && (
            <div className="mt-2">
              <React.Suspense fallback={
                <div className="bg-[#0C0D13] border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
                  <span className="text-xs text-slate-400">Memuat Chart Candle...</span>
                </div>
              }>
                <PriceChartModal
                  item={selectedItem}
                  onClose={() => {}}
                  priceMap={priceMap}
                  avgWagePerPP={averageWagePerPP}
                  isInline={true}
                />
              </React.Suspense>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#12141C] border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
          <AlertCircle className="w-8 h-8 text-slate-600 mb-1" />
          <span>Gagal memuat ticker pasar. Layanan official WarEra API sedang tidak responsif atau proxy terganggu.</span>
        </div>
      )}

    </div>
  );
}