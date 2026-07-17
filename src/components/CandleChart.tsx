import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, type IChartApi } from 'lightweight-charts';
import { type Candle } from '../api/apiClient';
import { RefreshCw } from 'lucide-react';

interface CandleChartProps {
  itemCode: string;
  candles: Candle[];
  loading: boolean;
  errorMsg: string;
  tf: string;
  setTf: (tf: string) => void;
}

const TIMEFRAMES: { value: string; label: string }[] = [
  { value: 'week', label: '1 Minggu' },
  { value: 'month', label: '1 Bulan' },
];

export default function CandleChart({ itemCode, candles, loading, errorMsg, tf, setTf }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (loading || errorMsg || candles.length === 0) {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      return;
    }

    if (!containerRef.current) return;

    // Bersihkan chart lama sebelum bikin baru
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94A3B8',
      },
      grid: {
        vertLines: { color: '#1E293B' },
        horzLines: { color: '#1E293B' },
      },
      width: containerRef.current.clientWidth,
      height: 280,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34D399',
      downColor: '#FB7185',
      borderVisible: false,
      wickUpColor: '#34D399',
      wickDownColor: '#FB7185',
    });

    const formatted = candles
      .map((c: Candle) => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    series.setData(formatted);
    chart.timeScale().fitContent();
    chartRef.current = chart;

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles, loading, errorMsg]);

  // Responsif kalau container-nya resize (misal modal berubah ukuran)
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
          Candle · WarEra Pulse Gateway
        </div>
        <div className="flex gap-1">
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
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0C0D13]/60 z-10 rounded-lg">
            <RefreshCw className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        )}
        {errorMsg ? (
          <div className="text-center py-16 text-xs text-slate-500">{errorMsg}</div>
        ) : (
          <div ref={containerRef} className="w-full" />
        )}
      </div>

      <div className="text-[10px] text-slate-600 mt-2">
        Data candle dari <span className="text-slate-500">warera-pulse.info</span> — sumber pihak ketiga,
        bukan API resmi WarEra.
      </div>
    </div>
  );
}
