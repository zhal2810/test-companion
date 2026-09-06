import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { X, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import ItemIcon from './ItemIcon';
import CandleChart from './CandleChart';
import { GAME_ITEMS } from '../data/gameConfig';
import { getCandleHistory, Candle, getItemStats, getLiveTransactions, LiveTransaction, getMarketOrders, type MarketOrder } from '../api/apiClient';
import OrderBook from './OrderBook';
import { calculateProductionMargin, calculateOrderBookImbalance, computeMarketSignal, DEFAULT_AVG_WAGE_PER_PP, computeTechnicalSignal } from '../utils/signalEngine';
import { getConsistentPrice, formatPrice } from '../utils/priceHelper';

interface PriceChartModalProps {
  item: {
    item: string;
    name: string;
    price: number;
    changeValue: number;
    volume: any;
    points?: number[];
    topBuy?: string;
    topSell?: string;
    changeByRange?: {
      all: number;
      '24h': number | null;
      '7d': number | null;
      '30d': number | null;
      '90d': number | null;
    };
  };
  onClose?: () => void;
  priceMap?: Record<string, number>;
  avgWagePerPP?: number;
  isInline?: boolean;
}

function formatVolume(value: any): string {
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return Math.round(num).toLocaleString('id-ID');
}

export default function PriceChartModal({ item, onClose, priceMap = {}, avgWagePerPP, isInline = false }: PriceChartModalProps) {
  const [chartView, setChartView] = React.useState<'line' | 'candle'>('candle');
  const [displayTf, setDisplayTf] = useState('day'); // 'day' 24H·1H default, 'week' 7D, 'month' 30D
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [orderBookRaw, setOrderBookRaw] = useState<{ buy: { price: number; quantity: number }[]; sell: { price: number; quantity: number }[] } | null>(null);
  const [orderBookError, setOrderBookError] = useState('');
  const [marketOrders, setMarketOrders] = useState<{ buyOrders: MarketOrder[]; sellOrders: MarketOrder[] }>({
    buyOrders: [],
    sellOrders: [],
  });
  const [marketOrdersLoading, setMarketOrdersLoading] = useState(false);
  const [marketOrdersError, setMarketOrdersError] = useState('');
  const [liveTrades, setLiveTrades] = useState<LiveTransaction[]>([]);
  const [liveTradesLoading, setLiveTradesLoading] = useState(false);
  const [isFilteredByItem, setIsFilteredByItem] = useState(false);
  const [priceSource, setPriceSource] = useState<'candle' | 'cache' | 'api' | 'fallback' | 'live' | 'snapshot'>('fallback');
  const [manualWagePerPP, setManualWagePerPP] = useState<string>(() => {
    const saved = localStorage.getItem('warera_wage_per_pp');
    return saved !== null ? saved : '';
  });
  const [manualBonusPP, setManualBonusPP] = useState<string>(() => {
    const saved = localStorage.getItem('warera_bonus_pp');
    return saved !== null ? saved : '';
  });

  const points = Array.isArray(item.points) ? item.points : [];
  const chartData = points.map((price, index) => ({ index, price }));

  // WarEra Pulse hanya mendukung 'week' (7D · 1H, 168 candle) dan 'month' (30D · 12H, 61 candle) -> 24H pakai week lalu slice 24
  const fetchTf = displayTf === 'day' ? 'week' : displayTf;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErrorMsg('');

      const res = await getCandleHistory(item.item, fetchTf);
      if (cancelled) return;

      if (!res.success || res.data.length === 0) {
        setErrorMsg('Belum ada data candle buat item ini di WarEra Pulse.');
        setCandles([]);
        setLoading(false);
        return;
      }

      setCandles(res.data);
      setLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [item.item, fetchTf]);

  // Order book (bid/ask) — dipakai buat konfirmasi sinyal margin produksi.
  // Fetch sekali per item, tidak bergantung pada timeframe chart.
  useEffect(() => {
    let cancelled = false;
    setOrderBookError('');
    setOrderBookRaw(null);

    getItemStats(item.item).then((res) => {
      if (cancelled) return;
      if (res.success && res.data?.orderbook) {
        setOrderBookRaw(res.data.orderbook);
      } else {
        setOrderBookError(res.error || 'Order book tidak tersedia');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [item.item]);

  // Load full market orders for the selected commodity.
  // API mengambil sampai 30 per sisi; UI OrderBook hanya menampilkan 10 per sisi.
  useEffect(() => {
    let cancelled = false;

    const loadMarketOrders = async () => {
      setMarketOrdersLoading(true);
      setMarketOrdersError('');

      const res = await getMarketOrders(item.item, 30);

      if (cancelled) return;

      if (res.success) {
        setMarketOrders(res.data);
      } else {
        setMarketOrders({
          buyOrders: [],
          sellOrders: [],
        });
        setMarketOrdersError(res.error || 'Gagal mengambil data BID/OFFER');
      }

      setMarketOrdersLoading(false);
    };

    loadMarketOrders();

    const interval = setInterval(loadMarketOrders, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [item.item]);

  // Load realized market trades (sudah dibeli/dijual, bukan pending) dengan user data
  const loadLiveTrades = async () => {
    setLiveTradesLoading(true);
    try {
      const response = await fetch(`/api/market/offers/${encodeURIComponent(item.item)}?limit=20`);
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Non-JSON response from /api/market/offers');
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setLiveTrades(data.data as LiveTransaction[]);
          setIsFilteredByItem(true);
        } else {
          setLiveTrades([]);
          setIsFilteredByItem(false);
        }
      } else {
        setLiveTrades([]);
        setIsFilteredByItem(false);
      }
    } catch (err) {
      console.error('Failed to load offers:', err);
      setLiveTrades([]);
      setIsFilteredByItem(false);
    }
    setLiveTradesLoading(false);
  };

  useEffect(() => {
    loadLiveTrades();
    const interval = setInterval(() => {
      loadLiveTrades();
    }, 8000); // realtime: 8 detik (dari 15s)
    return () => clearInterval(interval);
  }, [item.item]);

  // Sort candles chronologically to guarantee correct first/last selection
  const sortedCandles = React.useMemo(() => {
    if (!candles || candles.length === 0) return [];
    return [...candles].sort((a, b) => Number(a.time) - Number(b.time));
  }, [candles]);

  // Saring candle sesuai timeframe visual yang dipilih (slice) - 24H = 24 candle terakhir dari week
  const filteredCandles = React.useMemo(() => {
    if (sortedCandles.length === 0) return [];
    if (displayTf === 'day') return sortedCandles.slice(-24);
    // 'week' (7D · 1H) dan 'month' (30D · 12H) menampilkan semua candle yang ditarik
    return sortedCandles;
  }, [sortedCandles, displayTf]);

  const hasCandles = filteredCandles.length > 0;
  const lastCandle = hasCandles ? filteredCandles[filteredCandles.length - 1] : null;
  const firstCandle = hasCandles ? filteredCandles[0] : null;

  // Live price realtime dari transaksi terakhir (3s lalu 3.589) - override candle 3.578 yang telat 10 jam
  const liveLatestPrice = React.useMemo(() => {
    if (!liveTrades || liveTrades.length === 0) return null;
    const tx = liveTrades[0] as any;
    const p = Number(tx?.price ?? (tx?.money && tx?.quantity ? tx.money/tx.quantity : 0));
    if (!Number.isFinite(p) || p <= 0) return null;
    const t = tx?.createdAt ? new Date(tx.createdAt).getTime() : (tx?.offerAt ? new Date(tx.offerAt).getTime() : 0);
    // pakai kalau transaksi < 30 menit
    if (t && Date.now() - t > 30*60*1000) return null;
    return p;
  }, [liveTrades]);

  const displayPrice = liveLatestPrice ?? (lastCandle ? lastCandle.close : item.price);
  const isLivePrice = liveLatestPrice !== null && Number.isFinite(liveLatestPrice) && liveLatestPrice !== lastCandle?.close;

  // ✅ Get consistent price from cache/candle (for price source indicator) - realtime: live > snapshot > candle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fallback = lastCandle ? lastCandle.close : item.price;
      const result = await getConsistentPrice(item.item, fallback);
      if (!cancelled) setPriceSource(result.source as any);
    })();
    return () => {
      cancelled = true;
    };
  }, [item.item, lastCandle, liveLatestPrice]);
  
  // % perubahan 24 jam — dihitung dari candle (candle terakhir vs candle ~24 jam
  // lalu), sumber yang sama dengan warera-pulse. changeByRange['24h'] hanya dipakai
  // bila tersedia; jangan jatuh ke changeValue (perbandingan cache antar-fetch
  // yang nilainya ~0 dan tidak merepresentasikan perubahan 24 jam sesungguhnya).
  const displayChange = React.useMemo(() => {
    const change24h = item.changeByRange?.['24h'];
    if (change24h !== null && change24h !== undefined && Number.isFinite(Number(change24h)) && Math.abs(Number(change24h)) > 0.05) {
      return Number(change24h);
    }
    if (lastCandle && sortedCandles.length > 1) {
      const targetTime = Number(lastCandle.time) - 86400;
      let base: Candle | null = null;
      for (let i = sortedCandles.length - 2; i >= 0; i--) {
        if (Number(sortedCandles[i].time) <= targetTime) {
          base = sortedCandles[i];
          break;
        }
      }
      const basePrice = base ? Number(base.close) : Number(sortedCandles[0].close);
      if (basePrice > 0) return ((Number(lastCandle.close) - basePrice) / basePrice) * 100;
    }
    if (Number.isFinite(Number(item.changeValue))) return Number(item.changeValue);
    return 0;
  }, [item.changeByRange, item.changeValue, lastCandle, sortedCandles]);

  const displayHigh = hasCandles 
    ? Math.max(...filteredCandles.map(c => c.high)) 
    : (points.length ? Math.max(...points) : item.price);

  const displayLow = hasCandles 
    ? Math.min(...filteredCandles.map(c => c.low)) 
    : (points.length ? Math.min(...points) : item.price);

  const isUp = displayChange >= 0;

  const usingFallback = !hasCandles && !loading;

  // Upah/PP efektif: manual (0 = tanpa pekerja) jika diisi, else fallback ke snapshot/auto
  const effectiveWagePerPP = React.useMemo(() => {
    if (manualWagePerPP.trim() === '') return avgWagePerPP ?? DEFAULT_AVG_WAGE_PER_PP;
    const num = Number(manualWagePerPP);
    return Number.isFinite(num) && num >= 0 ? num : (avgWagePerPP ?? DEFAULT_AVG_WAGE_PER_PP);
  }, [manualWagePerPP, avgWagePerPP]);

  // Bonus PP manual % (misal 20 = PP efektif 10/(1+0.2)=8.33, labor turun)
  const effectiveBonusPP = React.useMemo(() => {
    if (manualBonusPP.trim() === '') return 0;
    const n = Number(manualBonusPP);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [manualBonusPP]);

  // Simulator Lokal Buy/Sell tanpa fee
  const [simBuyPrice, setSimBuyPrice] = useState<string>('');
  const [simBuyQty, setSimBuyQty] = useState<string>('100');
  const [simSellPrice, setSimSellPrice] = useState<string>('');
  const [simSellQty, setSimSellQty] = useState<string>('100');
  useEffect(()=>{
    if(!simBuyPrice && bestOffer) setSimBuyPrice(String(bestOffer));
    if(!simSellPrice && bestBid) setSimSellPrice(String(bestBid));
  }, [bestOffer, bestBid]);

  const marginResult = React.useMemo(
    () => calculateProductionMargin(item.item, priceMap, effectiveWagePerPP, effectiveBonusPP),
    [item.item, priceMap, effectiveWagePerPP, effectiveBonusPP]
  );

  const orderBookImbalance = React.useMemo(() => {
    if (!orderBookRaw) return null;
    const referencePrice = displayPrice || item.price;
    if (!referencePrice || referencePrice <= 0) return null;

    const orders = [
      ...orderBookRaw.buy.map((o) => ({ type: 'buy' as const, price: o.price, quantity: o.quantity })),
      ...orderBookRaw.sell.map((o) => ({ type: 'sell' as const, price: o.price, quantity: o.quantity })),
    ];
    return calculateOrderBookImbalance(orders, referencePrice);
  }, [orderBookRaw, displayPrice, item.price]);

  // Item raw (bahan mentah): analisis lebih fokus supply & demand
  const isRaw = (GAME_ITEMS[item.item] || GAME_ITEMS[item.item.toLowerCase()])?.type === 'raw';

  // Persentase volume beli terhadap total volume (untuk penjelasan tekanan jual/beli)
  const bidSharePercent = React.useMemo(() => {
    if (!orderBookImbalance) return null;
    const total = orderBookImbalance.bidVolume + orderBookImbalance.askVolume;
    if (total <= 0) return 50;
    return (orderBookImbalance.bidVolume / total) * 100;
  }, [orderBookImbalance]);

  const bestBid = React.useMemo(() => {
    const prices = orderBookRaw?.buy?.map((o) => Number(o.price)).filter((p) => Number.isFinite(p) && p > 0) || [];
    return prices.length ? Math.max(...prices) : null;
  }, [orderBookRaw]);

  const bestOffer = React.useMemo(() => {
    const prices = orderBookRaw?.sell?.map((o) => Number(o.price)).filter((p) => Number.isFinite(p) && p > 0) || [];
    return prices.length ? Math.min(...prices) : null;
  }, [orderBookRaw]);

  const signalResult = React.useMemo(
    () => computeMarketSignal(
      sortedCandles.map((c) => Number(c.close)).filter((p) => Number.isFinite(p) && p > 0),
      Number(displayPrice),
      orderBookImbalance,
      bestBid,
      bestOffer
    ),
    [sortedCandles, displayPrice, orderBookImbalance, bestBid, bestOffer]
  );

  const signalStyle = {
    buy: { label: 'BUY', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    sell: { label: 'SELL', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    hold: { label: 'HOLD', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  }[signalResult.signal];

  const productionStatus = marginResult
    ? {
        label: marginResult.marginPercent >= 0 ? 'PRODUKSI MENGUNTUNGKAN' : 'PRODUKSI TIDAK MENGUNTUNGKAN',
        className: marginResult.marginPercent >= 0
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
          : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      }
    : {
        label: 'DATA PRODUKSI TIDAK LENGKAP',
        className: 'bg-slate-500/15 text-slate-400 border-slate-500/30'
      };

  // Sinyal teknikal ikut timeframe chart (24H/7D/30D) biar request teknikal 24H langsung kebaca
  const technicalSignalResult = React.useMemo(
    () => computeTechnicalSignal(filteredCandles),
    [filteredCandles]
  );

  // Periode data yang benar-benar dipakai untuk indikator teknikal (MA/RSI),
  // ikut filteredCandles (24H = 24 jam, 7D = 7 hari)
  const techDataPeriod = React.useMemo(() => {
    if (filteredCandles.length === 0) return 'Tanpa Data';
    const times = filteredCandles.map((c) => Number(c.time));
    const spanHours = (Math.max(...times) - Math.min(...times)) / 3600;
    if (spanHours < 24) return `${Math.max(1, Math.round(spanHours))} Jam`;
    if (spanHours < 720) return `${Math.round(spanHours / 24)} Hari`;
    return `${Math.round(spanHours / 720)} Bulan`;
  }, [filteredCandles]);

  const techSignalStyle = {
    buy: { label: 'BUY', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    sell: { label: 'SELL', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    hold: { label: 'HOLD', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  }[technicalSignalResult.signal];

  const tfLabel = React.useMemo(() => {
    if (usingFallback) return 'All-time, data candle kosong';
    return '24 Jam';
  }, [usingFallback]);

  const content = (
    <div className={`bg-[#0C0D13] border border-slate-800 rounded-2xl w-full shadow-2xl overflow-hidden ${isInline ? '' : 'max-w-2xl max-h-[92vh] overflow-y-auto'}`}>
      {/* HEADER */}
      <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-800 bg-[#10121A]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-center shrink-0">
            <ItemIcon itemCode={item.item} size="md" />
          </div>
          <div>
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              {(GAME_ITEMS[item.item] || GAME_ITEMS[item.item.toLowerCase()])?.type === 'raw' ? 'Bahan Mentah (Raw)' : 'Barang Jadi (Product)'}
            </div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              {item.name}
              <span className="text-xs font-mono text-slate-400 font-normal">({item.item})</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* PRICE & CHANGE BADGE IN HEADER - realtime indicator */}
          <div className="text-right">
            <div className="text-sm font-mono font-black text-white flex items-center justify-end gap-1.5">
              {formatPrice(displayPrice)}
              {isLivePrice && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1 py-0.5 rounded font-black animate-pulse">LIVE</span>}
            </div>
            <div className={`text-[10px] font-mono font-bold flex items-center justify-end gap-0.5 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{displayChange.toFixed(2)}% {isLivePrice && <span className="text-[8px] text-slate-500">• real-time</span>}
            </div>
          </div>

          {!isInline && onClose && (
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition duration-150 cursor-pointer p-1"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* 1. CANDLE / LINE CHART (UTAMA) */}
      <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-[#090A0F]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-400 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Grafik Candle
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setChartView('candle')}
              className={`text-[10px] font-bold px-2 py-0.5 rounded transition duration-150 cursor-pointer ${
                chartView === 'candle' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Candle
            </button>
            <button
              onClick={() => setChartView('line')}
              className={`text-[10px] font-bold px-2 py-0.5 rounded transition duration-150 cursor-pointer ${
                chartView === 'line' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Line
            </button>
          </div>
        </div>

        {chartView === 'candle' ? (
          <CandleChart 
            itemCode={item.item} 
            candles={filteredCandles} 
            loading={loading} 
            errorMsg={errorMsg} 
            tf={displayTf} 
            setTf={setDisplayTf} 
          />
        ) : chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="index" hide />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#64748B', fontSize: 10 }}
                width={50}
                tickFormatter={(v) => formatPrice(v)}
              />
              <Tooltip
                contentStyle={{ background: '#0C0D13', border: '1px solid #1E293B', borderRadius: 8, fontSize: 12 }}
                labelFormatter={() => ''}
                formatter={(value) => [formatPrice(Number(value ?? 0)), 'Harga']}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke={isUp ? '#34D399' : '#FB7185'}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-xs text-slate-500">
            Belum ada data histori harga yang cukup buat chart item ini.
          </div>
        )}
      </div>

      {/* 2. KETERANGAN & STATS (DI BAWAH CANDLE) */}
      <div className="p-3 sm:p-4 space-y-4">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800/60 pb-1.5">
          <span>Keterangan & Ringkasan Pasar</span>
        </div>

        {/* PRICE SUMMARY GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-900/30 border border-slate-800/60 rounded-xl">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Harga Ticker</div>
            {loading && !hasCandles ? (
              <div className="h-5 w-16 bg-slate-800/60 rounded animate-pulse" />
            ) : (
              <div className="text-sm font-mono font-black text-white">{formatPrice(displayPrice)}</div>
            )}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Perubahan ({tfLabel})</div>
            {loading && !hasCandles ? (
              <div className="h-5 w-16 bg-slate-800/60 rounded animate-pulse" />
            ) : (
              <div className={`text-sm font-mono font-black flex items-center gap-1 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {isUp ? '+' : ''}{displayChange.toFixed(2)}%
              </div>
            )}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">High / Low</div>
            {loading && !hasCandles ? (
              <div className="h-5 w-20 bg-slate-800/60 rounded animate-pulse" />
            ) : (
              <div className="text-xs font-mono font-bold text-slate-300">{formatPrice(displayHigh)} / {formatPrice(displayLow)}</div>
            )}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Volume & Top Order</div>
            <div className="text-xs font-mono font-bold text-slate-300">
              {formatVolume(item.volume)} <span className="text-[10px] text-slate-500 font-normal">(Vol)</span>
            </div>
          </div>
        </div>

        {/* TOP BID & ASK STRIP */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-emerald-500/80 font-bold">Top Bid:</span>
            <span className="text-xs font-mono font-extrabold text-emerald-400">{item.topBuy || '—'}</span>
          </div>
          <div className="bg-rose-950/20 border border-rose-500/20 rounded-lg p-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-rose-500/80 font-bold">Top Ask:</span>
            <span className="text-xs font-mono font-extrabold text-rose-400">{item.topSell || '—'}</span>
          </div>
        </div>

        {/* BURSA PASAR — BID / OFFER */}
        <OrderBook
          buyOrders={marketOrders.buyOrders}
          sellOrders={marketOrders.sellOrders}
          loading={marketOrdersLoading}
          error={marketOrdersError}
        />

        {/* SINYAL EKONOMI & TEKNIKAL - DUAL ENGINE */}
        <div className="border border-slate-800/80 bg-slate-900/10 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            {/* COLUMN 1: FUNDAMENTAL/EKONOMI PRODUKSI */}
            <div className="border border-slate-800/50 bg-[#0E1017] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2 border-b border-slate-800/60 pb-1.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Ekonomi Produksi
                </span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${productionStatus.className}`}>
                  {productionStatus.label}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <span className="text-[8.5px] uppercase text-slate-500 font-bold">Upah/PP</span>
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  value={manualWagePerPP}
                  onChange={(e) => {
                    setManualWagePerPP(e.target.value);
                    localStorage.setItem('warera_wage_per_pp', e.target.value);
                  }}
                  placeholder={Number(avgWagePerPP ?? DEFAULT_AVG_WAGE_PER_PP).toFixed(3)}
                  title="Upah per PP untuk hitung biaya produksi. Kosongkan = otomatis (snapshot). Isi 0 = tanpa pekerja."
                  className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-white text-center outline-none focus:border-indigo-500"
                />
                {manualWagePerPP.trim() !== '' ? (
                  <button
                    onClick={() => {
                      setManualWagePerPP('');
                      localStorage.removeItem('warera_wage_per_pp');
                    }}
                    className="text-[8.5px] text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                  >
                    reset
                  </button>
                ) : (
                  <span className="text-[8.5px] text-slate-600">auto</span>
                )}
                <span className="text-[8.5px] uppercase text-slate-500 font-bold ml-1">Bonus PP%</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={manualBonusPP}
                  onChange={(e) => {
                    setManualBonusPP(e.target.value);
                    localStorage.setItem('warera_bonus_pp', e.target.value);
                  }}
                  placeholder="0"
                  title="Bonus produksi % - mengurangi PP efektif. Misal 20% = PP 10 jadi 8.33, Upah turun."
                  className="w-14 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-white text-center outline-none focus:border-indigo-500"
                />
                {manualBonusPP.trim() !== '' && (
                  <button
                    onClick={() => {
                      setManualBonusPP('');
                      localStorage.removeItem('warera_bonus_pp');
                    }}
                    className="text-[8.5px] text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                  >
                    reset
                  </button>
                )}
              </div>
              
              {marginResult ? (
                <>
                  <div className="grid grid-cols-3 gap-1.5 mb-2 text-[10px]">
                  <div>
                    <div className="text-[8.5px] uppercase text-slate-500 font-bold">Cost/Unit</div>
                    <div className="font-mono font-bold text-slate-300">{formatPrice(marginResult.costPerUnit)}</div>
                  </div>
                  <div>
                    <div className="text-[8.5px] uppercase text-slate-500 font-bold">Harga Pasar</div>
                    <div className="font-mono font-bold text-slate-300">{formatPrice(marginResult.marketPrice)}</div>
                  </div>
                  <div>
                    <div className="text-[8.5px] uppercase text-slate-500 font-bold">Margin</div>
                    <div className={`font-mono font-bold ${marginResult.marginPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {marginResult.marginPercent >= 0 ? '+' : ''}{marginResult.marginPercent.toFixed(1)}%
                    </div>
                  </div>
                  </div>
                  <div className="text-[8.5px] text-slate-600 mb-2 -mt-1">
                    Bahan baku: {formatPrice(marginResult.materialCost)} • Upah: {formatPrice(marginResult.laborCost)}
                  </div>
                </>
              ) : null}

              {orderBookImbalance && (
                <div className="grid grid-cols-3 gap-1.5 mb-2 text-[10px] border-t border-slate-800/30 pt-1.5">
                  <div>
                    <div className="text-[8.5px] uppercase text-slate-500 font-bold">Bid Vol</div>
                    <div className="font-mono font-bold text-emerald-400">{orderBookImbalance.bidVolume.toLocaleString('id-ID')}</div>
                  </div>
                  <div>
                    <div className="text-[8.5px] uppercase text-slate-500 font-bold">Ask Vol</div>
                    <div className="font-mono font-bold text-rose-400">{orderBookImbalance.askVolume.toLocaleString('id-ID')}</div>
                  </div>
                  <div>
                    <div className="text-[8.5px] uppercase text-slate-500 font-bold">Ratio</div>
                    <div className="font-mono font-bold text-slate-300">
                      {Number.isFinite(orderBookImbalance.imbalanceRatio) ? orderBookImbalance.imbalanceRatio.toFixed(2) : '∞'}
                    </div>
                  </div>
                </div>
              )}

              <ul className="space-y-0.5 mt-1">
                {marginResult && (
                  <li className="text-[9.5px] text-slate-500 flex gap-1 leading-snug">
                    <span>•</span>
                    <span>
                      Margin produksi {marginResult.marginPercent >= 0 ? 'positif' : 'negatif'}
                      ({marginResult.marginPercent >= 0 ? '+' : ''}{marginResult.marginPercent.toFixed(1)}%)
                      — {marginResult.marginPercent >= 0 ? 'produksi masih ekonomis pada harga saat ini.' : 'harga pasar berada di bawah biaya produksi.'}
                    </span>
                  </li>
                )}
                {orderBookImbalance && (
                  isRaw ? (
                    <>
                      <li className="text-[9.5px] text-slate-500 flex gap-1 leading-snug">
                        <span>•</span>
                        <span>
                          {orderBookImbalance.askVolume > orderBookImbalance.bidVolume
                            ? `Ask ${orderBookImbalance.askVolume.toLocaleString('id-ID')} vs Bid ${orderBookImbalance.bidVolume.toLocaleString('id-ID')} (Ratio ${Number.isFinite(orderBookImbalance.imbalanceRatio) ? orderBookImbalance.imbalanceRatio.toFixed(2) : '∞'}) — supply lebih besar daripada demand → harga cenderung turun.`
                            : orderBookImbalance.bidVolume > orderBookImbalance.askVolume
                              ? `Bid ${orderBookImbalance.bidVolume.toLocaleString('id-ID')} vs Ask ${orderBookImbalance.askVolume.toLocaleString('id-ID')} (Ratio ${Number.isFinite(orderBookImbalance.imbalanceRatio) ? orderBookImbalance.imbalanceRatio.toFixed(2) : '∞'}) — demand lebih besar daripada supply → harga cenderung naik.`
                              : `Bid & Ask seimbang (${orderBookImbalance.bidVolume.toLocaleString('id-ID')} masing-masing) — harga cenderung sideways.`}
                        </span>
                      </li>
                      {bidSharePercent != null && (
                        <li className="text-[9.5px] text-slate-500 flex gap-1 leading-snug">
                          <span>•</span>
                          <span>
                            {bidSharePercent < 40
                              ? `Bid share hanya ${bidSharePercent.toFixed(0)}% dari total volume — tekanan jual sangat mendominasi pasar item ini.`
                              : bidSharePercent < 50
                                ? `Bid share ${bidSharePercent.toFixed(0)}% dari total volume — tekanan jual lebih mendominasi pasar item ini.`
                                : bidSharePercent > 60
                                  ? `Bid share ${bidSharePercent.toFixed(0)}% dari total volume — tekanan beli sangat mendominasi pasar item ini.`
                                  : bidSharePercent > 50
                                    ? `Bid share ${bidSharePercent.toFixed(0)}% dari total volume — tekanan beli lebih mendominasi pasar item ini.`
                                    : `Bid share ${bidSharePercent.toFixed(0)}% dari total volume — pasokan & permintaan relatif seimbang.`}
                          </span>
                        </li>
                      )}
                    </>
                  ) : (
                    <li className="text-[9.5px] text-slate-500 flex gap-1 leading-snug">
                      <span>•</span>
                      <span>
                        {orderBookImbalance.askVolume > orderBookImbalance.bidVolume
                          ? `Offer lebih besar dari Bid (${orderBookImbalance.askVolume.toLocaleString('id-ID')} vs ${orderBookImbalance.bidVolume.toLocaleString('id-ID')}) — supply lebih besar daripada demand.`
                          : `Bid lebih besar atau setara dengan Offer (${orderBookImbalance.bidVolume.toLocaleString('id-ID')} vs ${orderBookImbalance.askVolume.toLocaleString('id-ID')}) — demand relatif lebih kuat.`}
                      </span>
                    </li>
                  )
                )}
                {marginResult?.missingInputPrices?.length ? (
                  <li className="text-[9.5px] text-amber-500/80 flex gap-1 leading-snug">
                    <span>•</span>
                    <span>Harga bahan baku tidak lengkap: {marginResult.missingInputPrices.join(', ')}.</span>
                  </li>
                ) : null}
              </ul>
            </div>

            {/* COLUMN 2: ANALISIS TEKNIKAL (MA & RSI) */}
            <div className="border border-slate-800/50 bg-[#0E1017] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2 border-b border-slate-800/60 pb-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Teknikal (MA & RSI)
                  </span>
                  <span className="text-[8.5px] bg-slate-800 text-slate-400 px-1 rounded font-mono font-bold uppercase">
                    {techDataPeriod}
                  </span>
                </div>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${techSignalStyle.className}`}>
                  {techSignalStyle.label}
                </span>
              </div>

              {technicalSignalResult.hasSufficientData ? (
                <div className="grid grid-cols-3 gap-1.5 mb-2 text-[10px]">
                  <div>
                    <div className="text-[8.5px] uppercase text-slate-500 font-bold">MA9 / MA21</div>
                    <div className="font-mono font-bold text-slate-300">
                      {formatPrice(technicalSignalResult.ma9)} / {formatPrice(technicalSignalResult.ma21)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8.5px] uppercase text-slate-500 font-bold">MA20 Trend</div>
                    <div className={`font-mono font-bold ${technicalSignalResult.trend === 'uptrend' ? 'text-emerald-400' : technicalSignalResult.trend === 'downtrend' ? 'text-rose-400' : 'text-slate-400'}`}>
                      {formatPrice(technicalSignalResult.ma20)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8.5px] uppercase text-slate-500 font-bold">RSI (14)</div>
                    <div className={`font-mono font-bold ${technicalSignalResult.rsi > 70 ? 'text-rose-400 font-black animate-pulse' : technicalSignalResult.rsi < 30 ? 'text-emerald-400 font-black' : 'text-slate-300'}`}>
                      {technicalSignalResult.rsi.toFixed(1)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[9.5px] text-slate-500 bg-slate-900/40 p-2 rounded border border-slate-800/40 text-center mb-2">
                  Data candle kurang dari 22 bar untuk indikator teknikal.
                </div>
              )}

              <ul className="space-y-0.5 mt-1">
                {technicalSignalResult.reasons.map((reason, idx) => (
                  <li key={idx} className="text-[9.5px] text-slate-500 flex gap-1 leading-snug">
                    <span>•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* OVERALL CROSS-CONFIRMATION ACTIONABLE RECOMMENDATION */}
          <div className="p-2.5 bg-slate-950/40 border border-slate-800/40 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
            <div className="w-full">
              <div className="text-[8.5px] uppercase tracking-wider text-slate-500 font-black">
                Konfirmasi Pasar + Teknikal
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                {signalResult.signal === 'buy' && technicalSignalResult.signal === 'buy' ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    🔥 BUY terkonfirmasi: Fair Value/order book dan teknikal sama-sama mendukung.
                  </span>
                ) : signalResult.signal === 'sell' && technicalSignalResult.signal === 'sell' ? (
                  <span className="text-rose-400 font-bold flex items-center gap-1">
                    🚨 SELL terkonfirmasi: Fair Value/order book dan teknikal sama-sama mendukung.
                  </span>
                ) : (signalResult.signal === 'buy' && technicalSignalResult.signal === 'sell') || (signalResult.signal === 'sell' && technicalSignalResult.signal === 'buy') ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    ⚠️ Sinyal pasar dan teknikal bertentangan. Gunakan HOLD sampai arah lebih jelas.
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Sinyal pasar tetap menjadi keputusan utama; RSI/MA hanya berfungsi sebagai konfirmasi.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-[8.5px] text-slate-600">
            ⚠️ Bukan saran finansial — biaya produksi memakai upah {effectiveWagePerPP.toFixed(3)} cc/PP {manualWagePerPP.trim() !== '' ? '(manual)' : ''}.
          </div>
        </div>

        {/* SIMULATOR LOKAL - Buy/Sell tanpa fee */}
        <div className="border border-slate-800/80 bg-[#0E1017] rounded-xl p-3 space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/60 pb-1.5">Simulasi Lokal (Tanpa Fee)</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-2">
              <div className="text-[9px] uppercase text-emerald-500 font-bold mb-1">BUY</div>
              <div className="flex gap-1 mb-1">
                <input type="number" step={0.001} value={simBuyPrice} onChange={e=>setSimBuyPrice(e.target.value)} placeholder={bestOffer?String(bestOffer):'1.654'} className="flex-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-xs font-mono text-white" />
                <span className="text-[10px] text-slate-500 self-center">×</span>
                <input type="number" step={1} value={simBuyQty} onChange={e=>setSimBuyQty(e.target.value)} placeholder="100" className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-xs font-mono text-white text-center" />
              </div>
              <div className="flex gap-1 flex-wrap mb-1">
                {[100,500,1000,5000,10000].map(v=>(
                  <button key={v} onClick={()=>setSimBuyQty(String(v))} className={`text-[9px] px-1.5 py-0.5 rounded border ${simBuyQty===String(v)?'bg-emerald-500/20 text-emerald-400 border-emerald-500/30':'bg-slate-800 text-slate-500 border-slate-700'}`}>{v>=1000?`${v/1000}k`:v}</button>
                ))}
              </div>
              <div className="text-[10px] font-mono text-slate-400">Total: <span className="text-white font-bold">{(() => { const p=Number(simBuyPrice), q=Number(simBuyQty); return Number.isFinite(p)&&Number.isFinite(q)? formatPrice(p*q):'—'; })()}</span></div>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-2">
              <div className="text-[9px] uppercase text-rose-500 font-bold mb-1">SELL</div>
              <div className="flex gap-1 mb-1">
                <input type="number" step={0.001} value={simSellPrice} onChange={e=>setSimSellPrice(e.target.value)} placeholder={bestBid?String(bestBid):'1.655'} className="flex-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-xs font-mono text-white" />
                <span className="text-[10px] text-slate-500 self-center">×</span>
                <input type="number" step={1} value={simSellQty} onChange={e=>setSimSellQty(e.target.value)} placeholder="100" className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-xs font-mono text-white text-center" />
              </div>
              <div className="flex gap-1 flex-wrap mb-1">
                {[100,500,1000,5000,10000].map(v=>(
                  <button key={v} onClick={()=>setSimSellQty(String(v))} className={`text-[9px] px-1.5 py-0.5 rounded border ${simSellQty===String(v)?'bg-rose-500/20 text-rose-400 border-rose-500/30':'bg-slate-800 text-slate-500 border-slate-700'}`}>{v>=1000?`${v/1000}k`:v}</button>
                ))}
              </div>
              <div className="text-[10px] font-mono text-slate-400">Total: <span className="text-white font-bold">{(() => { const p=Number(simSellPrice), q=Number(simSellQty); return Number.isFinite(p)&&Number.isFinite(q)? formatPrice(p*q):'—'; })()}</span></div>
            </div>
          </div>
          {(() => {
            const bp=Number(simBuyPrice), bq=Number(simBuyQty), sp=Number(simSellPrice), sq=Number(simSellQty);
            if(!Number.isFinite(bp)||!Number.isFinite(bq)||!Number.isFinite(sp)||!Number.isFinite(sq)||bq<=0||sq<=0) return <div className="text-[10px] text-slate-600 text-center">Isi harga & qty buy/sell</div>;
            const totalBuy=bp*bq, totalSell=sp*sq;
            const gross=totalSell-totalBuy;
            const roi= totalBuy>0? (gross/totalBuy*100):0;
            const profitPerUnit = sq>0? gross/sq : 0;
            const breakEven = sq>0? totalBuy/sq : 0;
            const fair = signalResult.fairValue?.fairValue ?? displayPrice;
            const vsFairBuy = fair>0? ((bp-fair)/fair*100):0;
            const vsFairSell = fair>0? ((sp-fair)/fair*100):0;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                <div className="bg-slate-950/60 border border-slate-800 rounded p-1.5 text-center"><div className="text-slate-500 uppercase text-[8px]">Gross</div><div className={`font-bold ${gross>=0?'text-emerald-400':'text-rose-400'}`}>{gross>=0?'+':''}{formatPrice(gross)}</div></div>
                <div className="bg-slate-950/60 border border-slate-800 rounded p-1.5 text-center"><div className="text-slate-500 uppercase text-[8px]">ROI</div><div className={`font-bold ${roi>=0?'text-emerald-400':'text-rose-400'}`}>{roi>=0?'+':''}{roi.toFixed(2)}%</div></div>
                <div className="bg-slate-950/60 border border-slate-800 rounded p-1.5 text-center"><div className="text-slate-500 uppercase text-[8px]">Profit/Unit</div><div className={`font-bold ${profitPerUnit>=0?'text-emerald-400':'text-rose-400'}`}>{profitPerUnit>=0?'+':''}{formatPrice(profitPerUnit)}</div></div>
                <div className="bg-slate-950/60 border border-slate-800 rounded p-1.5 text-center"><div className="text-slate-500 uppercase text-[8px]">Break-even</div><div className="font-bold text-slate-300">{formatPrice(breakEven)}</div></div>
                <div className="col-span-2 sm:col-span-4 text-[9px] text-slate-500 text-center">vs Fair {formatPrice(fair)}: Buy {vsFairBuy>=0?'+':''}{vsFairBuy.toFixed(2)}% / Sell {vsFairSell>=0?'+':''}{vsFairSell.toFixed(2)}%</div>
              </div>
            );
          })()}
        </div>

        {/* LIVE TRADE FEED */}
        <div className="border-t border-slate-800/40 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                Live Market Offers {item.name || item.item}
              </span>
            </div>
            <button 
              onClick={loadLiveTrades} 
              disabled={liveTradesLoading}
              className="text-[9.5px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${liveTradesLoading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>
          </div>

          <div className="bg-[#07080C] border border-slate-800/50 rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-1 bg-slate-900/40 border-b border-slate-800/40 text-[8.5px] uppercase tracking-wider font-bold text-slate-500">
              <div className="col-span-2">Waktu</div>
              <div className="col-span-2">Tipe</div>
              <div className="col-span-2 text-left">Pembeli</div>
              <div className="col-span-2 text-left">Penjual</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Harga/u</div>
            </div>

            {liveTradesLoading && liveTrades.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-600 animate-pulse">Menghubungkan ke WarEra API...</div>
            ) : liveTrades.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-600">Tidak ada transaksi terbaru untuk item ini.</div>
            ) : (
              <div className="max-h-[140px] overflow-y-auto divide-y divide-slate-800/30">
                {liveTrades.map((offer: any, idx) => {
                  const date = new Date(offer.offerAt || offer.createdAt);
                  const timeStr = date.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });
                  const offerType = offer.type || 'offer';
                  const typeColor = offerType === 'buy' ? 'text-emerald-400' : offerType === 'sell' ? 'text-rose-400' : 'text-slate-400';

                  return (
                    <div key={offer._id || offer.offerId || idx} className="grid grid-cols-12 gap-2 items-center px-3 py-1 hover:bg-slate-900/30 text-[9.5px] font-mono transition duration-150">
                      <div className="col-span-2 text-slate-500 text-[9px]">{timeStr}</div>
                      <div className={`col-span-2 font-bold text-[8.5px] uppercase ${typeColor}`}>
                        {offerType === 'buy' ? 'BELI' : offerType === 'sell' ? 'JUAL' : offerType}
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                        {offer.avatarUrl && (
                          <img 
                            src={offer.avatarUrl} 
                            alt={offer.username} 
                            className="w-4 h-4 rounded-full shrink-0 bg-slate-800"
                          />
                        )}
                        <span className="text-slate-300 truncate text-[8.5px]">{offer.username || 'Unknown'}</span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                        {offer.avatarUrlSeller && (
                          <img 
                            src={offer.avatarUrlSeller} 
                            alt={offer.usernameSeller} 
                            className="w-4 h-4 rounded-full shrink-0 bg-slate-800"
                          />
                        )}
                        <span className="text-slate-300 truncate text-[8.5px]">{offer.usernameSeller || 'Unknown'}</span>
                      </div>
                      <div className="col-span-2 text-right text-slate-300 font-bold text-[9px]">{(offer.quantity || 0).toLocaleString('id-ID')}</div>
                      <div className="col-span-2 text-right leading-tight">
                        <span className="text-emerald-400 font-bold text-[9px]">{formatPrice(offer.price || 0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (isInline) {
    return content;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl">
        {content}
      </div>
    </div>
  );
}