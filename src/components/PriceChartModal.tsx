import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import ItemIcon from './ItemIcon';
import CandleChart from './CandleChart';
import { getCandleHistory, Candle } from '../api/apiClient';
import { calculateProductionMargin, computeTradeSignal } from '../utils/signalEngine';

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
}

function formatVolume(value: any): string {
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return Math.round(num).toLocaleString('id-ID');
}

export default function PriceChartModal({ item, onClose, priceMap = {} }: PriceChartModalProps) {
  const [chartView, setChartView] = React.useState<'line' | 'candle'>('candle');
  const [tf, setTf] = useState('week');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const points = Array.isArray(item.points) ? item.points : [];
  const chartData = points.map((price, index) => ({ index, price }));

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErrorMsg('');

      const res = await getCandleHistory(item.item, tf);
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
  }, [item.item, tf]);

  // Sort candles chronologically to guarantee correct first/last selection
  const sortedCandles = React.useMemo(() => {
    if (!candles || candles.length === 0) return [];
    return [...candles].sort((a, b) => Number(a.time) - Number(b.time));
  }, [candles]);

  const hasCandles = sortedCandles.length > 0;
  const lastCandle = hasCandles ? sortedCandles[sortedCandles.length - 1] : null;
  const firstCandle = hasCandles ? sortedCandles[0] : null;

  const displayPrice = lastCandle ? lastCandle.close : item.price;
  
  // Calculate percentage change over the selected timeframe using the first and last candle
  const displayChange = React.useMemo(() => {
    if (!lastCandle || !firstCandle) return item.changeValue;
    const basePrice = firstCandle.open || firstCandle.close;
    if (!basePrice || basePrice === 0) return 0;
    return ((lastCandle.close - basePrice) / basePrice) * 100;
  }, [lastCandle, firstCandle, item.changeValue]);

  const displayHigh = hasCandles 
    ? Math.max(...sortedCandles.map(c => c.high)) 
    : (points.length ? Math.max(...points) : item.price);

  const displayLow = hasCandles 
    ? Math.min(...sortedCandles.map(c => c.low)) 
    : (points.length ? Math.min(...points) : item.price);

  const isUp = displayChange >= 0;

  const usingFallback = !hasCandles && !loading;

  const marginResult = React.useMemo(
    () => calculateProductionMargin(item.item, priceMap),
    [item.item, priceMap]
  );
  const signalResult = React.useMemo(
    () => computeTradeSignal(marginResult, null),
    [marginResult]
  );

  const signalStyle = {
    buy: { label: 'BUY', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    sell: { label: 'SELL', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    hold: { label: 'HOLD', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  }[signalResult.signal];

  const tfLabel = React.useMemo(() => {
    if (usingFallback) return 'All-time, data candle kosong';
    if (tf === 'day') return '1 Hari';
    if (tf === 'week') return '1 Minggu';
    if (tf === 'month') return '1 Bulan';
    return 'Rentang Waktu';
  }, [tf, usingFallback]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0C0D13] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-center shrink-0">
              <ItemIcon itemCode={item.item} size="md" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.item}</div>
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

        {/* SINYAL BUY/SELL/HOLD — berbasis margin ekonomi produksi */}
        <div className="p-5 border-b border-slate-800/60">
          <div className="flex items-center gap-2 mb-2.5">
            <span className={`text-xs font-black px-2.5 py-1 rounded-full border uppercase tracking-wider ${signalStyle.className}`}>
              {signalStyle.label}
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Sinyal berbasis ekonomi produksi
            </span>
          </div>

          {marginResult ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-2.5 text-xs">
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

          <ul className="space-y-1">
            {signalResult.reasons.map((reason, idx) => (
              <li key={idx} className="text-[11px] text-slate-500 flex gap-1.5">
                <span>•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>

          <div className="text-[10px] text-slate-600 mt-2">
            ⚠️ Ini bukan saran finansial — cuma estimasi dari biaya bahan baku + asumsi wage rata-rata (0.13 cc/PP).
            Order book belum ikut dipertimbangkan di versi ini.
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
              candles={candles} 
              loading={loading} 
              errorMsg={errorMsg} 
              tf={tf} 
              setTf={setTf} 
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
      </div>
    </div>
  );
}
