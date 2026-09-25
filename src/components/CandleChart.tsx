import React, { useEffect, useRef, useState } from 'react';

import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createTextWatermark,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';

import { type Candle, type MarketOrder } from '../api/apiClient';
import { calculateSMA } from '../utils/signalEngine';
import { formatPrice } from '../utils/priceHelper';

import { RefreshCw } from 'lucide-react';

function formatCompactQty(n: number): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(v));
}

function aggregateByPrice(orders: MarketOrder[]): { price: number; quantity: number }[] {
  const map = new Map<number, number>();
  for (const order of orders) {
    const price = Number(order.price);
    const quantity = Number(order.quantity) || 0;
    map.set(price, (map.get(price) || 0) + quantity);
  }
  return Array.from(map.entries()).map(([price, quantity]) => ({ price, quantity }));
}

// Format waktu ke WIB (UTC+7) untuk label sumbu bawah chart dan crosshair.
// Candle API berupa timestamp UTC, jadi perlu konversi eksplisit ke Asia/Jakarta.
function formatWIB(timestamp: number): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp * 1000));
}

interface CandleChartProps {
  itemCode: string;
  candles: Candle[];
  loading: boolean;
  errorMsg: string;
  tf: string;
  setTf: (tf: string) => void;
  buyOrders?: MarketOrder[];
  sellOrders?: MarketOrder[];
}

const TIMEFRAMES: { value: string; label: string }[] = [
  { value: 'day', label: '24H · 1H' },
  { value: 'week', label: '7D · 1H' },
  { value: 'month', label: '30D · 12H' },
];


export default function CandleChart({
  itemCode,
  candles,
  loading,
  errorMsg,
  tf,
  setTf,
  buyOrders = [],
  sellOrders = [],
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [showMA, setShowMA] = useState(true);

  const bidVolume = buyOrders.reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
  const offerVolume = sellOrders.reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
  const totalVolume = bidVolume + offerVolume;
  const bidPct = totalVolume > 0 ? (bidVolume / totalVolume) * 100 : 50;
  const offerPct = totalVolume > 0 ? 100 - bidPct : 50;
  const bidLevels = aggregateByPrice(buyOrders).sort((a, b) => b.price - a.price).slice(0, 5);
  const offerLevels = aggregateByPrice(sellOrders).sort((a, b) => a.price - b.price).slice(0, 5);
  const maxBidQty = Math.max(1, ...bidLevels.map((o) => o.quantity));
  const maxOfferQty = Math.max(1, ...offerLevels.map((o) => o.quantity));

  // Main candle chart
  useEffect(() => {
    if (loading || errorMsg || candles.length === 0) {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      return;
    }

    if (!containerRef.current) return;

    // Bersihkan chart lama sebelum membuat chart baru
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: {
          type: ColorType.Solid,
          color: 'transparent',
        },
        textColor: '#94A3B8',
        attributionLogo: false as any,
      },
      grid: {
        vertLines: {
          color: '#1E293B',
        },
        horzLines: {
          color: '#1E293B',
        },
      },
      width: containerRef.current.clientWidth,
      height: 280,
      localization: {
        timeFormatter: (timestamp: number) => formatWIB(timestamp),
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          if (typeof time !== 'number') return null;
          return formatWIB(time);
        },
      },
    } as any);

    // Derive precision/minMove dari magnitude harga aktual candle, bukan
    // hardcode. Tanpa minMove, lightweight-charts memakai default 0.01 —
    // untuk item sub-1 (iron ~0.081, grain ~0.076) seluruh range lebih kecil
    // dari satu step 0.01 sehingga skala harga collapse & crosshair beku.
    const maxAbsPrice = Math.max(
      1e-9,
      ...candles.map((c) => Math.max(Math.abs(c.high), Math.abs(c.low)))
    );
    let pricePrecision: number;
    let minMove: number;
    if (maxAbsPrice < 0.1) { pricePrecision = 5; minMove = 0.00001; }
    else if (maxAbsPrice < 1) { pricePrecision = 4; minMove = 0.0001; }
    else if (maxAbsPrice < 10) { pricePrecision = 3; minMove = 0.001; }
    else { pricePrecision = 2; minMove = 0.01; }

    // Data fallback dari series Realmarijn berupa candle sintetis
    // (open===high===low===close). Deteksi itu dan render sebagai line,
    // bukan candlestick, supaya chart terlihat sebagai garis harga.
    const isSeriesFallback =
      candles.length > 0 &&
      candles.every((c) => c.open === c.high && c.high === c.low && c.low === c.close);

    const series = isSeriesFallback
      ? chart.addSeries(LineSeries, {
          color: '#34D399',
          lineWidth: 2,
          priceLineVisible: false,
          crosshairMarkerVisible: true,
          priceFormat: {
            type: 'price',
            precision: pricePrecision,
            minMove,
          },
        } as any)
      : chart.addSeries(CandlestickSeries, {
          upColor: '#34D399',
          downColor: '#FB7185',
          borderVisible: false,
          wickUpColor: '#34D399',
          wickDownColor: '#FB7185',
          priceFormat: {
            type: 'price',
            precision: pricePrecision,
            minMove,
          },
        });

    // Configure price scale untuk konsisten
    const priceScale = series.priceScale();
    priceScale.applyOptions({
      autoScale: true,
      mode: 0, // 0 = Normal (linear). Jangan 1 — itu Logarithmic.
      invertScale: false,
      alignLabels: true,
      borderVisible: true,
      borderColor: '#1E293B',
      textColor: '#94A3B8',
      entireTextOnly: false,
      ticksVisible: true,
    });

    const formatted = candles
      .map((c: Candle) => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .sort(
        (a, b) =>
          (a.time as number) -
          (b.time as number)
      );

    series.setData(
      isSeriesFallback
        ? formatted.map((c) => ({ time: c.time, value: c.close }))
        : formatted
    );

    // MA overlay
    if (showMA && candles.length >= 9) {
      const sorted = [...formatted].sort((a,b)=> (a.time as number)-(b.time as number));
      const closes = sorted.map(c=> c.close);
      const times = sorted.map(c=> c.time);

      const ma9 = calculateSMA(closes, 9);
      const ma21 = calculateSMA(closes, 21);
      const ma20 = calculateSMA(closes, 20);

      const ma9Series = chart.addSeries(LineSeries, { color: '#FBBF24', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false } as any);
      const ma21Series = chart.addSeries(LineSeries, { color: '#60A5FA', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false } as any);
      const ma20Series = chart.addSeries(LineSeries, { color: '#E2E8F0', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false } as any);

      const toData = (arr: number[]) => arr.map((v,i)=> Number.isFinite(v) ? { time: times[i], value: v } : null).filter(Boolean) as any[];
      ma9Series.setData(toData(ma9));
      ma21Series.setData(toData(ma21));
      ma20Series.setData(toData(ma20));
    }

    // Auto-scroll menampilkan SELURUH data (fitContent), bukan menyempit ke
    // candle terakhir. Kalau di-scroll ke realtime, axis hanya memperhitungkan
    // beberapa candle terakhir sehingga harga tampak beku di nilai terkini.
    chart.timeScale().fitContent();

    // Hide TV attribution logo via DOM (fallback jika option tidak support)
    try {
      const tvLink = (containerRef.current as HTMLElement).querySelector('a[href*="tradingview"]') as HTMLElement | null;
      if (tvLink) tvLink.style.display = 'none';
    } catch {}

    chartRef.current = chart;

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles, loading, errorMsg, showMA]);

  // Responsif ketika ukuran container berubah
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1.5 items-center">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTf(t.value)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition duration-150 cursor-pointer ${
                tf === t.value
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Trading tools toolbar - ganti attribution TV */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowMA(v=>!v)}
            title="Toggle MA9/21/20 overlay"
            className={`text-[10px] font-bold px-2 py-1 rounded border transition cursor-pointer ${showMA ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-slate-900 text-slate-500 border-slate-800'}`}
          >
            MA
          </button>
          <span className="text-[8px] text-slate-600 ml-1 hidden sm:inline">Tools</span>
        </div>
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0C0D13]/60 z-10 rounded-lg">
            <RefreshCw className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        )}

        {errorMsg ? (
          <div className="text-center py-16 text-xs text-slate-500">
            {errorMsg}
          </div>
        ) : (
          <>
            <div
              ref={containerRef}
              className="w-full"
            />
            {!loading && !errorMsg && (
              <div className="mt-2 border-t border-slate-800/50 pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Bursa · Bid vs Offer</span>
                  <span className="text-[8px] text-slate-600 font-mono">5 level / sisi</span>
                </div>

                {/* PERCENTAGE BAR */}
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-[#0A0C10] border border-slate-800">
                    <div className="bg-emerald-500/80 transition-all duration-500" style={{ width: `${bidPct}%` }} />
                    <div className="bg-rose-500/80 transition-all duration-500" style={{ width: `${offerPct}%` }} />
                  </div>
                  <span className="text-[9px] font-mono font-bold whitespace-nowrap">
                    <span className="text-emerald-400">{bidPct.toFixed(0)}%</span>
                    <span className="text-slate-600"> · </span>
                    <span className="text-rose-400">{offerPct.toFixed(0)}%</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 font-mono">
                  {/* BUY SIDE */}
                  <div>
                    <div className="text-[8px] uppercase text-emerald-500/80 font-bold mb-0.5">Buy (Bid)</div>
                    {bidLevels.length === 0 && <div className="text-[8.5px] text-slate-600">—</div>}
                    {bidLevels.map((level, i) => (
                      <div key={i} className="relative flex items-center justify-between text-[9.5px] leading-[1.45] text-emerald-400">
                        <div className="absolute inset-y-0 right-0 bg-emerald-500/10" style={{ width: `${(level.quantity / maxBidQty) * 100}%` }} />
                        <span className="relative">{formatPrice(level.price)}</span>
                        <span className="relative text-[8.5px] text-emerald-500/80">{formatCompactQty(level.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  {/* SELL SIDE */}
                  <div>
                    <div className="text-[8px] uppercase text-rose-500/80 font-bold mb-0.5">Sell (Offer)</div>
                    {offerLevels.length === 0 && <div className="text-[8.5px] text-slate-600">—</div>}
                    {offerLevels.map((level, i) => (
                      <div key={i} className="relative flex items-center justify-between text-[9.5px] leading-[1.45] text-rose-400">
                        <div className="absolute inset-y-0 right-0 bg-rose-500/10" style={{ width: `${(level.quantity / maxOfferQty) * 100}%` }} />
                        <span className="relative">{formatPrice(level.price)}</span>
                        <span className="relative text-[8.5px] text-rose-500/80">{formatCompactQty(level.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* TOTALS */}
                <div className="flex justify-between mt-1 pt-1 border-t border-slate-800/50 text-[9px] font-mono">
                  <span className="text-slate-500">Bid vol <span className="text-emerald-400 font-bold">{formatCompactQty(bidVolume)}</span></span>
                  <span className="text-slate-500">Offer vol <span className="text-rose-400 font-bold">{formatCompactQty(offerVolume)}</span></span>
                </div>
              </div>
            )}
            {showMA && (
              <div className="flex gap-3 mt-1.5 text-[9px] font-mono">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block"/> MA9</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block"/> MA21</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-300 inline-block border-dashed"/> MA20</span>
              </div>
            )}
          </>
        )}
      </div>

      
    </div>
  );
}
