import React, { useEffect, useRef } from 'react';

import {
  createChart,
  ColorType,
  CandlestickSeries,
  type IChartApi,
} from 'lightweight-charts';

import { type Candle } from '../api/apiClient';

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
  { value: '6h', label: '6 Jam' },
  { value: '12h', label: '12 Jam' },
  { value: '1d', label: '1 Hari' },
  { value: '1w', label: '1 Minggu' },
  { value: '1m', label: '1 Bulan' },
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

      /*
       * Candle API tetap UTC.
       *
       * localization.timeFormatter membuat label crosshair
       * pada chart mengikuti WIB (UTC+7).
       */
      localization: {
        timeFormatter: (timestamp: number) => formatWIB(timestamp),
      },

      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        /*
         * Sumbu bawah (tick marks) di v5 TIDAK ikut localization.timeFormatter —
         * default-nya mengikuti timezone browser. Dipaksa WIB di sini supaya
         * tanggal & jam di sumbu bawah selalu konsisten.
         */
        tickMarkFormatter: (time) => {
          if (typeof time !== 'number') return null;
          return formatWIB(time);
        },
      },
    });

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

    // Auto-scroll menampilkan SELURUH data (fitContent), bukan menyempit ke
    // candle terakhir. Kalau di-scroll ke realtime, axis hanya memperhitungkan
    // beberapa candle terakhir sehingga harga tampak beku di nilai terkini.
    chart.timeScale().fitContent();

    chartRef.current = chart;

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles, loading, errorMsg]);

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
          <div className="text-center py-16 text-xs text-slate-500">
            {errorMsg}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full"
          />
        )}
      </div>

      <div className="text-[10px] text-slate-600 mt-2">
        Data candle dari{' '}
        <span className="text-slate-500">
          warera-pulse.info
        </span>{' '}
        — sumber pihak ketiga, bukan API resmi WarEra.
      </div>
    </div>
  );
}