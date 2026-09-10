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

import { type Candle } from '../api/apiClient';
import { calculateSMA, calculateRSI } from '../utils/signalEngine';

import { RefreshCw } from 'lucide-react';

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
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);

  const [showMA, setShowMA] = useState(true);
  const [showRSI, setShowRSI] = useState(true);

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

    const series = chart.addSeries(CandlestickSeries, {
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

    series.setData(formatted);

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

  // RSI panel
  useEffect(() => {
    if (!showRSI || loading || errorMsg || candles.length < 14) {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
      return;
    }
    if (!rsiContainerRef.current) return;
    if (rsiChartRef.current) {
      rsiChartRef.current.remove();
      rsiChartRef.current = null;
    }
    const sorted = [...candles].sort((a,b)=> Number(a.time)-Number(b.time));
    const closes = sorted.map(c=> Number(c.close));
    const times = sorted.map(c=> c.time as any);
    const rsiArr = calculateRSI(closes, 14);

    const rsiChart = createChart(rsiContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#64748B', attributionLogo: false as any },
      grid: { vertLines: { color: '#1E293B' }, horzLines: { color: '#1E293B' } },
      width: rsiContainerRef.current.clientWidth,
      height: 120,
      localization: { timeFormatter: (t:number)=> formatWIB(t) },
      timeScale: { timeVisible: true, secondsVisible: false, tickMarkFormatter: (t:any)=> typeof t==='number'? formatWIB(t): null },
      rightPriceScale: { borderVisible: false, entireTextOnly: false, ticksVisible: true },
    } as any);

    const rsiSeries = rsiChart.addSeries(LineSeries, { color: '#A78BFA', lineWidth: 1.5, priceLineVisible: false } as any);
    const data = rsiArr.map((v,i)=> Number.isFinite(v) ? { time: times[i], value: Number(v.toFixed(2)) } : null).filter(Boolean) as any[];
    rsiSeries.setData(data);

    // Overbought/oversold lines 70/30
    const line70 = rsiChart.addSeries(LineSeries, { color: 'rgba(251,113,133,0.5)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false } as any);
    const line30 = rsiChart.addSeries(LineSeries, { color: 'rgba(52,211,153,0.5)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false } as any);
    const refTimes = times.filter((_,i)=> Number.isFinite(rsiArr[i]));
    line70.setData(refTimes.map(t=> ({ time: t, value: 70 })) as any);
    line30.setData(refTimes.map(t=> ({ time: t, value: 30 })) as any);

    rsiChart.timeScale().fitContent();
    // sync timescales
    if (chartRef.current) {
      const main = chartRef.current.timeScale();
      const rsi = rsiChart.timeScale();
      // simple sync on visible range change
      try {
        (main as any).subscribeVisibleTimeRangeChange?.((range:any)=>{
          if(range) rsi.setVisibleRange(range);
        });
      } catch {}
    }
    // hide TV link
    try {
      const tvLink = (rsiContainerRef.current as HTMLElement).querySelector('a[href*="tradingview"]') as HTMLElement | null;
      if (tvLink) tvLink.style.display = 'none';
    } catch {}
    rsiChartRef.current = rsiChart;
    return () => {
      if (rsiChartRef.current) { rsiChartRef.current.remove(); rsiChartRef.current = null; }
    };
  }, [candles, loading, errorMsg, showRSI]);

  // Responsif ketika ukuran container berubah
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
      if (rsiChartRef.current && rsiContainerRef.current) {
        rsiChartRef.current.applyOptions({ width: rsiContainerRef.current.clientWidth });
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
          <button
            onClick={() => setShowRSI(v=>!v)}
            title="Toggle RSI 14 panel"
            className={`text-[10px] font-bold px-2 py-1 rounded border transition cursor-pointer ${showRSI ? 'bg-violet-500/15 text-violet-400 border-violet-500/30' : 'bg-slate-900 text-slate-500 border-slate-800'}`}
          >
            RSI
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
            {showRSI && candles.length >= 14 && !loading && !errorMsg && (
              <div className="mt-2 border-t border-slate-800/50 pt-2">
                <div className="text-[9px] font-bold text-violet-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>RSI (14)</span>
                  <span className="text-[8px] text-slate-600 font-normal">30 oversold • 70 overbought</span>
                </div>
                <div ref={rsiContainerRef} className="w-full" />
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
