import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { X, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import ItemIcon from './ItemIcon';
import CandleChart from './CandleChart';
import { GAME_ITEMS } from '../data/gameConfig';
import { getCandleHistory, Candle, getItemStats, getLiveTransactions, LiveTransaction } from '../api/apiClient';
import { calculateProductionMargin, calculateOrderBookImbalance, computeTradeSignal, DEFAULT_AVG_WAGE_PER_PP, computeTechnicalSignal } from '../utils/signalEngine';

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
  };
  onClose: () => void;
  priceMap?: Record<string, number>;
  avgWagePerPP?: number;
}

function formatVolume(value: any): string {
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return Math.round(num).toLocaleString('id-ID');
}

export default function PriceChartModal({ item, onClose, priceMap = {}, avgWagePerPP }: PriceChartModalProps) {
  const [chartView, setChartView] = React.useState<'line' | 'candle'>('candle');
  const [displayTf, setDisplayTf] = useState('1w'); // '6h', '12h', '1d', '1w', '1m'
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [orderBookRaw, setOrderBookRaw] = useState<{ buy: { price: number; quantity: number }[]; sell: { price: number; quantity: number }[] } | null>(null);
  const [orderBookError, setOrderBookError] = useState('');
  const [liveTrades, setLiveTrades] = useState<LiveTransaction[]>([]);
  const [liveTradesLoading, setLiveTradesLoading] = useState(false);

  const points = Array.isArray(item.points) ? item.points : [];
  const chartData = points.map((price, index) => ({ index, price }));

  // Deteksi timeframe fetch di API: 'day' (1 jam interval, isi 168) atau 'month' (12 jam interval, isi 61)
  const fetchTf = displayTf === '1m' ? 'month' : 'day';

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

  // Load live transaction feed
  const loadLiveTrades = async () => {
    setLiveTradesLoading(true);
    const res = await getLiveTransactions(item.item, 20); // Ambil 20 transaksi terbaru
    if (res.success) {
      setLiveTrades(res.data);
    }
    setLiveTradesLoading(false);
  };

  useEffect(() => {
    loadLiveTrades();
    const interval = setInterval(() => {
      loadLiveTrades();
    }, 15000); // refresh otomatis tiap 15 detik
    return () => clearInterval(interval);
  }, [item.item]);

  // Sort candles chronologically to guarantee correct first/last selection
  const sortedCandles = React.useMemo(() => {
    if (!candles || candles.length === 0) return [];
    return [...candles].sort((a, b) => Number(a.time) - Number(b.time));
  }, [candles]);

  // Saring candle sesuai timeframe visual yang dipilih (slice)
  const filteredCandles = React.useMemo(() => {
    if (sortedCandles.length === 0) return [];
    if (displayTf === '6h') return sortedCandles.slice(-6);
    if (displayTf === '12h') return sortedCandles.slice(-12);
    if (displayTf === '1d') return sortedCandles.slice(-24);
    return sortedCandles; // '1w' dan '1m' menampilkan semua candle yang ditarik
  }, [sortedCandles, displayTf]);

  const hasCandles = filteredCandles.length > 0;
  const lastCandle = hasCandles ? filteredCandles[filteredCandles.length - 1] : null;
  const firstCandle = hasCandles ? filteredCandles[0] : null;

  const displayPrice = lastCandle ? lastCandle.close : item.price;
  
  // Calculate percentage change over the selected timeframe using the first and last candle
  const displayChange = React.useMemo(() => {
    if (!lastCandle || !firstCandle) return item.changeValue;
    const basePrice = firstCandle.open || firstCandle.close;
    if (!basePrice || basePrice === 0) return 0;
    return ((lastCandle.close - basePrice) / basePrice) * 100;
  }, [lastCandle, firstCandle, item.changeValue]);

  const displayHigh = hasCandles 
    ? Math.max(...filteredCandles.map(c => c.high)) 
    : (points.length ? Math.max(...points) : item.price);

  const displayLow = hasCandles 
    ? Math.min(...filteredCandles.map(c => c.low)) 
    : (points.length ? Math.min(...points) : item.price);

  const isUp = displayChange >= 0;

  const usingFallback = !hasCandles && !loading;

  const marginResult = React.useMemo(
    () => calculateProductionMargin(item.item, priceMap, avgWagePerPP),
    [item.item, priceMap, avgWagePerPP]
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

  const signalResult = React.useMemo(
    () => computeTradeSignal(marginResult, orderBookImbalance),
    [marginResult, orderBookImbalance]
  );

  const signalStyle = {
    buy: { label: 'BUY', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    sell: { label: 'SELL', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    hold: { label: 'HOLD', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  }[signalResult.signal];

  // Sinyal teknikal dihitung menggunakan data tren yang lebih lengkap (sortedCandles) agar indikator MA/RSI presisi
  const technicalSignalResult = React.useMemo(
    () => computeTechnicalSignal(sortedCandles),
    [sortedCandles]
  );

  const techSignalStyle = {
    buy: { label: 'BUY', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    sell: { label: 'SELL', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    hold: { label: 'HOLD', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  }[technicalSignalResult.signal];

  const tfLabel = React.useMemo(() => {
    if (usingFallback) return 'All-time, data candle kosong';
    if (displayTf === '6h') return '6 Jam';
    if (displayTf === '12h') return '12 Jam';
    if (displayTf === '1d') return '1 Hari';
    if (displayTf === '1w') return '1 Minggu';
    if (displayTf === '1m') return '1 Bulan';
    return 'Rentang Waktu';
  }, [displayTf, usingFallback]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0C0D13] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-center shrink-0">
              <ItemIcon itemCode={item.item} size="md" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {(GAME_ITEMS[item.item] || GAME_ITEMS[item.item.toLowerCase()])?.type === 'raw' ? 'Bahan Mentah (Raw)' : 'Barang Jadi (Product)'}
              </div>
              <div className="text-base font-bold text-white">{item.name}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition duration-150 cursor-pointer p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PRICE SUMMARY */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-slate-800/60">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Harga Saat Ini</div>
            {loading && !hasCandles ? (
              <div className="h-6 w-20 bg-slate-800/60 rounded animate-pulse" />
            ) : (
              <div className="text-lg font-mono font-black text-white">{Number(displayPrice).toFixed(3)}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Perubahan ({tfLabel})</div>
            {loading && !hasCandles ? (
              <div className="h-6 w-16 bg-slate-800/60 rounded animate-pulse" />
            ) : (
              <div className={`text-lg font-mono font-black flex items-center gap-1 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isUp ? '+' : ''}{displayChange.toFixed(2)}%
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Tertinggi / Terendah</div>
            {loading && !hasCandles ? (
              <div className="h-5 w-24 bg-slate-800/60 rounded animate-pulse" />
            ) : (
              <div className="text-sm font-mono font-bold text-slate-300">{displayHigh.toFixed(3)} / {displayLow.toFixed(3)}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1 flex items-center gap-1">
              Volume
              <span className="text-slate-600 normal-case font-normal">(snapshot, bukan per-rentang)</span>
            </div>
            <div className="text-sm font-mono font-bold text-slate-300">{formatVolume(item.volume)}</div>
          </div>
        </div>

        {/* SINYAL EKONOMI & TEKNIKAL - DUAL ENGINE */}
        <div className="p-5 border-b border-slate-800/60 bg-slate-900/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* COLUMN 1: FUNDAMENTAL/EKONOMI PRODUKSI */}
            <div className="border border-slate-800/50 bg-[#0E1017] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                  Ekonomi Produksi
                </span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${signalStyle.className}`}>
                  {signalStyle.label}
                </span>
              </div>
              
              {marginResult ? (
                <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
                  <div>
                    <div className="text-[9px] uppercase text-slate-500 font-bold">Cost/Unit</div>
                    <div className="font-mono font-bold text-slate-300">{marginResult.costPerUnit.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-slate-500 font-bold">Harga Pasar</div>
                    <div className="font-mono font-bold text-slate-300">{marginResult.marketPrice.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-slate-500 font-bold">Margin</div>
                    <div className={`font-mono font-bold ${marginResult.marginPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {marginResult.marginPercent >= 0 ? '+' : ''}{marginResult.marginPercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ) : null}

              {orderBookImbalance && (
                <div className="grid grid-cols-3 gap-2 mb-3 text-[11px] border-t border-slate-800/30 pt-2">
                  <div>
                    <div className="text-[9px] uppercase text-slate-500 font-bold">Bid Vol</div>
                    <div className="font-mono font-bold text-emerald-400">{orderBookImbalance.bidVolume.toLocaleString('id-ID')}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-slate-500 font-bold">Ask Vol</div>
                    <div className="font-mono font-bold text-rose-400">{orderBookImbalance.askVolume.toLocaleString('id-ID')}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-slate-500 font-bold">Ratio</div>
                    <div className="font-mono font-bold text-slate-300">
                      {Number.isFinite(orderBookImbalance.imbalanceRatio) ? orderBookImbalance.imbalanceRatio.toFixed(2) : '∞'}
                    </div>
                  </div>
                </div>
              )}

              <ul className="space-y-1 mt-2">
                {signalResult.reasons.map((reason, idx) => (
                  <li key={idx} className="text-[10px] text-slate-500 flex gap-1.5 leading-relaxed">
                    <span>•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* COLUMN 2: ANALISIS TEKNIKAL (MA & RSI) */}
            <div className="border border-slate-800/50 bg-[#0E1017] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    Teknikal (MA & RSI)
                  </span>
                  <span className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded font-mono font-bold uppercase">
                    {displayTf.toUpperCase()}
                  </span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${techSignalStyle.className}`}>
                  {techSignalStyle.label}
                </span>
              </div>

              {technicalSignalResult.hasSufficientData ? (
                <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
                  <div>
                    <div className="text-[9px] uppercase text-slate-500 font-bold">MA9 / MA21</div>
                    <div className="font-mono font-bold text-slate-300">
                      {technicalSignalResult.ma9.toFixed(3)} / {technicalSignalResult.ma21.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-slate-500 font-bold">MA20 Trend</div>
                    <div className={`font-mono font-bold ${technicalSignalResult.trend === 'uptrend' ? 'text-emerald-400' : technicalSignalResult.trend === 'downtrend' ? 'text-rose-400' : 'text-slate-400'}`}>
                      {technicalSignalResult.ma20.toFixed(3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-slate-500 font-bold">RSI (14)</div>
                    <div className={`font-mono font-bold ${technicalSignalResult.rsi > 70 ? 'text-rose-400 font-black animate-pulse' : technicalSignalResult.rsi < 30 ? 'text-emerald-400 font-black' : 'text-slate-300'}`}>
                      {technicalSignalResult.rsi.toFixed(1)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-slate-500 bg-slate-900/40 p-2.5 rounded border border-slate-800/40 text-center mb-3">
                  Data candle tidak cukup untuk menghitung indikator teknikal (minimal butuh 22 candle).
                </div>
              )}

              <ul className="space-y-1 mt-2">
                {technicalSignalResult.reasons.map((reason, idx) => (
                  <li key={idx} className="text-[10px] text-slate-500 flex gap-1.5 leading-relaxed">
                    <span>•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* OVERALL CROSS-CONFIRMATION ACTIONABLE RECOMMENDATION */}
          <div className="mt-4 p-3 bg-slate-950/40 border border-slate-800/40 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="w-full">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-black">
                Konfirmasi Silang (Dual Engine Planner)
              </div>
              <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                {signalResult.signal === 'buy' && technicalSignalResult.signal === 'buy' ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    🔥 SINYAL KONFIRMASI BELI KUAT: Kedua engine memberikan rekomendasi BUY. Margin produksi sangat tipis/negatif (pasokan ketat) didukung momentum pembalikan arah MA & RSI.
                  </span>
                ) : signalResult.signal === 'sell' && technicalSignalResult.signal === 'sell' ? (
                  <span className="text-rose-400 font-bold flex items-center gap-1.5">
                    🚨 SINYAL KONFIRMASI JUAL KUAT: Kedua engine memberikan rekomendasi SELL. Margin produksi sangat tinggi (potensi lonjakan suplai) didukung jenuh beli teknikal.
                  </span>
                ) : (signalResult.signal === 'buy' && technicalSignalResult.signal === 'sell') || (signalResult.signal === 'sell' && technicalSignalResult.signal === 'buy') ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1.5">
                    ⚠️ SINYAL KONTRADIKTIF: Engine ekonomi dan teknikal saling bertolak belakang. Sangat disarankan HOLD atau tunggu konfirmasi momentum lebih lanjut untuk keamanan modal.
                  </span>
                ) : (
                  <span className="text-slate-400">
                    Sinyal bercampur atau salah satu menyarankan HOLD. Ambil tindakan dengan hati-hati sesuai dengan toleransi risiko Anda.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-[9px] text-slate-600 mt-3">
            ⚠️ Ini bukan saran finansial — biaya produksi memakai upah rata-rata {Number(avgWagePerPP ?? DEFAULT_AVG_WAGE_PER_PP).toFixed(3)} cc/PP dari snapshot WarEra Pulse.
            {orderBookRaw
              ? ' Order book (via warerastats.io) sudah ikut dipertimbangkan sebagai konfirmasi ekonomi.'
              : orderBookError
                ? ` Order book gagal dimuat (${orderBookError}) — sinyal ini murni dari margin produksi.`
                : ' Memuat order book…'}
          </div>
        </div>

        {/* CHART */}
        <div className="p-5">
          <div className="flex justify-end gap-1 mb-2">
            <button
              onClick={() => setChartView('candle')}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition duration-150 cursor-pointer ${
                chartView === 'candle' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Candle
            </button>
            <button
              onClick={() => setChartView('line')}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition duration-150 cursor-pointer ${
                chartView === 'line' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Line
            </button>
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
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="index" hide />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: '#64748B', fontSize: 10 }}
                  width={50}
                  tickFormatter={(v) => Number(v).toFixed(2)}
                />
                <Tooltip
                  contentStyle={{ background: '#0C0D13', border: '1px solid #1E293B', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={() => ''}
                  formatter={(value) => [Number(value ?? 0).toFixed(3), 'Harga']}
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
            <div className="text-center py-16 text-xs text-slate-500">
              Belum ada data histori harga yang cukup buat chart item ini.
            </div>
          )}
        </div>

        {/* BID / ASK */}
        <div className="grid grid-cols-2 gap-3 p-5 pt-0">
          <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-emerald-500/70 font-bold mb-1">Top Bid</div>
            <div className="text-sm font-mono font-bold text-emerald-400">{item.topBuy || '—'}</div>
          </div>
          <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-rose-500/70 font-bold mb-1">Top Ask</div>
            <div className="text-sm font-mono font-bold text-rose-400">{item.topSell || '—'}</div>
          </div>
        </div>

        {/* LIVE TRADE FEED */}
        <div className="p-5 pt-0 border-t border-slate-800/40 mt-1">
          <div className="flex items-center justify-between mb-3 pt-4">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Live Trade Feed (Transaksi Terbaru)</span>
            </div>
            <button 
              onClick={loadLiveTrades} 
              disabled={liveTradesLoading}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${liveTradesLoading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>
          </div>

          <div className="bg-[#07080C] border border-slate-800/50 rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 px-3.5 py-1.5 bg-slate-900/40 border-b border-slate-800/40 text-[9px] uppercase tracking-wider font-bold text-slate-500">
              <div>Waktu</div>
              <div className="text-right">Kuantitas</div>
              <div className="text-right">Harga (cc)</div>
            </div>

            {liveTradesLoading && liveTrades.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-600 animate-pulse">Menghubungkan ke WarEra Pulse...</div>
            ) : liveTrades.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-600">Tidak ada transaksi terdeteksi baru-baru ini.</div>
            ) : (
              <div className="max-h-[140px] overflow-y-auto divide-y divide-slate-800/30">
                {liveTrades.map((trade) => {
                  const date = new Date(trade.createdAt);
                  const timeStr = date.toLocaleString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });
                  return (
                    <div key={trade.id} className="grid grid-cols-3 px-3.5 py-2 hover:bg-slate-900/30 text-xs font-mono transition duration-150">
                      <div className="text-slate-500">{timeStr}</div>
                      <div className="text-right text-slate-300 font-bold">{trade.quantity.toLocaleString('id-ID')}</div>
                      <div className="text-right text-emerald-400 font-bold">{trade.money.toFixed(3)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-[9px] text-slate-600 mt-2 text-right">
            Transaksi pasar real-time via <span className="text-slate-500">warera-pulse.info/api/transactions</span>
          </div>
        </div>
      </div>
    </div>
  );
}