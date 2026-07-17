import React, { useState, useEffect, useRef } from 'react';
import { X, TrendingUp, TrendingDown, RefreshCw, BarChart2 } from 'lucide-react';
import { getMarketHistory, getMarketSpark } from '../api/apiClient';

interface PriceChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemCode: string | null;
  itemName: string;
  currentPrice: number;
  volume: any;
  change24h: number;
  topBuy?: string;
  topSell?: string;
}

interface PointCoordinate {
  x: number;
  y: number;
  price: number;
  index: number;
  time?: number; // Unix epoch in seconds
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

export default function PriceChartModal({
  isOpen,
  onClose,
  itemCode,
  itemName,
  currentPrice,
  volume,
  change24h,
  topBuy = '—',
  topSell = '—'
}: PriceChartModalProps) {
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>('week');
  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState<any[]>([]);
  const [sparkBackup, setSparkBackup] = useState<any>(null);
  const [hoveredPoint, setHoveredPoint] = useState<PointCoordinate | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (isOpen && itemCode) {
      loadHistoryData();
    } else {
      setCandles([]);
      setSparkBackup(null);
      setHoveredPoint(null);
    }
  }, [isOpen, itemCode, timeframe]);

  const loadHistoryData = async () => {
    setLoading(true);
    try {
      // 1. Fetch real historical candles
      const res = await getMarketHistory(itemCode!, timeframe);
      if (res?.success && Array.isArray(res?.data?.candles) && res.data.candles.length > 0) {
        setCandles(res.data.candles);
        return;
      }

      // 2. Fallback to Spark if real candles are missing or empty
      const sparkRes = await getMarketSpark();
      if (sparkRes?.success && sparkRes?.data && itemCode) {
        const key = Object.keys(sparkRes.data).find(k => k.toLowerCase() === itemCode.toLowerCase()) || '';
        const data = sparkRes.data[key];
        setSparkBackup(data || null);
      }
    } catch (err) {
      console.error('Failed to load history or spark data', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !itemCode) return null;

  const isUsingRealCandles = candles.length > 0;
  
  // Calculate general stats (Open, High, Low, Close)
  let openPrice = currentPrice;
  let highPrice = currentPrice;
  let lowPrice = currentPrice;
  let closePrice = currentPrice;

  if (isUsingRealCandles) {
    const closePrices = candles.map(c => c.close);
    openPrice = candles[0]?.open ?? closePrices[0] ?? currentPrice;
    highPrice = Math.max(...candles.map(c => c.high), ...closePrices, currentPrice);
    lowPrice = Math.min(...candles.map(c => c.low).filter(p => p > 0), ...closePrices, currentPrice);
    closePrice = candles[candles.length - 1]?.close ?? currentPrice;
  } else {
    const backupPoints: number[] = sparkBackup?.points || [];
    openPrice = sparkBackup?.open ?? (backupPoints.length > 0 ? backupPoints[0] : currentPrice);
    highPrice = sparkBackup?.high ?? (backupPoints.length > 0 ? Math.max(...backupPoints) : currentPrice);
    lowPrice = sparkBackup?.low ?? (backupPoints.length > 0 ? Math.min(...backupPoints.filter(p => p > 0)) : currentPrice);
    closePrice = backupPoints.length > 0 ? backupPoints[backupPoints.length - 1] : currentPrice;
  }

  // SVG parameters
  const svgWidth = 500;
  const svgHeight = 220;
  const paddingX = 25;
  const paddingY = 25;

  // Calculate coordinate boundaries
  let minVal = currentPrice * 0.9;
  let maxVal = currentPrice * 1.1;

  if (isUsingRealCandles) {
    const prices = candles.map(c => c.close);
    minVal = Math.min(...prices);
    maxVal = Math.max(...prices);
  } else {
    const backupPoints: number[] = sparkBackup?.points || [];
    if (backupPoints.length > 0) {
      minVal = Math.min(...backupPoints);
      maxVal = Math.max(...backupPoints);
    }
  }

  // Handle single value edge case
  if (minVal === maxVal) {
    minVal = minVal * 0.95;
    maxVal = maxVal * 1.05;
  }
  const valRange = maxVal - minVal;

  // Map coordinates
  const pointsCoordinates: PointCoordinate[] = [];
  if (isUsingRealCandles) {
    candles.forEach((c, idx) => {
      const x = paddingX + (idx / (candles.length - 1)) * (svgWidth - paddingX * 2);
      const val = c.close;
      const y = svgHeight - paddingY - ((val - minVal) / valRange) * (svgHeight - paddingY * 2);
      pointsCoordinates.push({
        x,
        y,
        price: val,
        index: idx,
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      });
    });
  } else {
    const backupPoints: number[] = sparkBackup?.points || [];
    backupPoints.forEach((val, idx) => {
      const x = paddingX + (idx / (backupPoints.length - 1)) * (svgWidth - paddingX * 2);
      const y = svgHeight - paddingY - ((val - minVal) / valRange) * (svgHeight - paddingY * 2);
      pointsCoordinates.push({
        x,
        y,
        price: val,
        index: idx,
        open: val,
        high: val,
        low: val,
        close: val
      });
    });
  }

  // Estimate or retrieve date/time for point
  const getPointDateTime = (idx: number, pt?: PointCoordinate) => {
    if (pt?.time) {
      return new Date(pt.time * 1000);
    }
    const totalCount = isUsingRealCandles ? candles.length : (sparkBackup?.points?.length || 0);
    const hoursAgo = totalCount - 1 - idx;
    const d = new Date();
    d.setHours(d.getHours() - hoursAgo);
    if (hoursAgo > 0) {
      d.setMinutes(0, 0, 0);
    }
    return d;
  };

  const formatXAxisLabel = (date: Date, isNow: boolean) => {
    if (isNow) return "Sekarang";
    
    const pad = (num: number) => String(num).padStart(2, '0');
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    
    if (timeframe === 'day') {
      return timeStr;
    } else if (timeframe === 'week') {
      const dayStr = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      return `${dayStr} ${timeStr}`;
    } else {
      return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    }
  };

  // Get 5 evenly spaced indices for X-axis labels
  const getXAxisIndices = (total: number) => {
    if (total <= 1) return [];
    if (total <= 5) return Array.from({ length: total }, (_, i) => i);
    return [
      0,
      Math.floor((total - 1) * 0.25),
      Math.floor((total - 1) * 0.5),
      Math.floor((total - 1) * 0.75),
      total - 1
    ];
  };

  const totalPoints = isUsingRealCandles ? candles.length : (sparkBackup?.points?.length || 0);
  const xAxisIndices = getXAxisIndices(totalPoints);

  // Paths
  let linePath = '';
  let areaPath = '';
  if (pointsCoordinates.length > 1) {
    linePath = `M ${pointsCoordinates[0].x} ${pointsCoordinates[0].y} ` +
      pointsCoordinates.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

    areaPath = `${linePath} L ${pointsCoordinates[pointsCoordinates.length - 1].x} ${svgHeight - paddingY} L ${pointsCoordinates[0].x} ${svgHeight - paddingY} Z`;
  }

  // Handle Mouse Hover
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgRef.current || pointsCoordinates.length === 0) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;

    let closest = pointsCoordinates[0];
    let minDiff = Math.abs(closest.x - mouseX);

    for (let i = 1; i < pointsCoordinates.length; i++) {
      const diff = Math.abs(pointsCoordinates[i].x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = pointsCoordinates[i];
      }
    }

    setHoveredPoint(closest);
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  const isUp = change24h >= 0;
  const strokeColor = isUp ? '#10b981' : '#f43f5e';
  const gradientId = `chart-gradient-${itemCode}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div 
        id="price-chart-modal"
        className="w-full max-w-lg bg-[#0D0F16] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl transition-all"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#0A0B10]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center font-bold text-xs text-[#e67e22]">
              {itemCode.substring(0, 3).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white leading-none">{itemName}</span>
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">{itemCode}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Live Historical Price Analysis</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* METRICS ROW */}
        <div className="p-4 grid grid-cols-3 gap-3 border-b border-slate-900 bg-[#090A0E]/50">
          <div className="bg-[#0A0C11] border border-slate-900 p-2.5 rounded-lg text-center">
            <span className="block text-[8.5px] uppercase font-bold text-slate-500 tracking-wider">Harga Ticker</span>
            <span className="text-sm font-mono font-extrabold text-white block mt-0.5">
              {currentPrice.toFixed(3)}
            </span>
            <span className="text-[9px] font-mono text-slate-500">cc</span>
          </div>

          <div className="bg-[#0A0C11] border border-slate-900 p-2.5 rounded-lg text-center">
            <span className="block text-[8.5px] uppercase font-bold text-slate-500 tracking-wider">Perubahan 24j</span>
            <div className={`flex items-center justify-center gap-0.5 mt-0.5 text-xs font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{isUp ? '+' : ''}{change24h.toFixed(2)}%</span>
            </div>
            <span className="text-[9px] text-slate-500">24 hours trend</span>
          </div>

          <div className="bg-[#0A0C11] border border-slate-900 p-2.5 rounded-lg text-center">
            <span className="block text-[8.5px] uppercase font-bold text-slate-500 tracking-wider">Volume Bursa</span>
            <span className="text-sm font-mono font-bold text-slate-300 block mt-0.5 truncate">
              {typeof volume === 'number' ? volume.toLocaleString() : volume}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">units traded</span>
          </div>
        </div>

        {/* TIMEFRAME SELECTOR */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#090A0E] border-b border-slate-900">
          <div className="flex gap-1">
            {(['day', 'week', 'month'] as const).map((tf) => {
              const labels = {
                day: '24 Jam',
                week: '1 Minggu',
                month: '1 Bulan'
              };
              const isActive = timeframe === tf;
              return (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded transition cursor-pointer ${
                    isActive 
                      ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' 
                      : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  {labels[tf]}
                </button>
              );
            })}
          </div>
          <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            Data Akurat Pulse
          </div>
        </div>

        {/* CHART WORK AREA */}
        <div className="p-4 bg-[#0A0C11]/25 relative">
          {loading ? (
            <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-slate-500 text-xs font-mono">
              <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
              <span>Mengunduh data candle historis...</span>
            </div>
          ) : totalPoints === 0 ? (
            <div className="h-[220px] flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6">
              <BarChart2 className="w-10 h-10 text-slate-800 mb-2" />
              <span>Belum ada histori candle untuk komoditas ini.</span>
              <span className="text-[10px] text-slate-600 mt-1">Data statistik bursa global sedang kosong atau dalam pemeliharaan.</span>
            </div>
          ) : (
            <div className="relative">
              {/* SVG Price Chart */}
              <svg 
                ref={svgRef}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-[220px] select-none"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = paddingY + ratio * (svgHeight - paddingY * 2);
                  const priceLabel = maxVal - ratio * valRange;
                  return (
                    <g key={idx}>
                      <line 
                        x1={paddingX} 
                        y1={y} 
                        x2={svgWidth - paddingX} 
                        y2={y} 
                        stroke="#1e293b" 
                        strokeOpacity="0.3" 
                        strokeDasharray="4 4" 
                      />
                      <text 
                        x={paddingX} 
                        y={y - 4} 
                        fill="#475569" 
                        fontSize="8.5" 
                        fontFamily="monospace"
                        className="font-bold select-none text-[8.5px]"
                      >
                        {priceLabel.toFixed(3)}
                      </text>
                    </g>
                  );
                })}

                {/* Vertical Grid lines */}
                {xAxisIndices.map((ptIdx) => {
                  const pt = pointsCoordinates.find(p => p.index === ptIdx);
                  if (!pt) return null;

                  return (
                    <g key={`v-${ptIdx}`}>
                      <line 
                        x1={pt.x} 
                        y1={paddingY} 
                        y2={svgHeight - paddingY} 
                        stroke="#1e293b" 
                        strokeOpacity="0.2" 
                        strokeDasharray="2 2" 
                      />
                    </g>
                  );
                })}

                {/* Shaded Area Path */}
                {areaPath && (
                  <path d={areaPath} fill={`url(#${gradientId})`} />
                )}

                {/* Stroke Path */}
                {linePath && (
                  <path 
                    d={linePath} 
                    fill="none" 
                    stroke={strokeColor} 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                    strokeLinejoin="round" 
                  />
                )}

                {/* Hover line & dot */}
                {hoveredPoint && (
                  <g>
                    <line 
                      x1={hoveredPoint.x} 
                      y1={paddingY} 
                      x2={hoveredPoint.x} 
                      y2={svgHeight - paddingY} 
                      stroke="#475569" 
                      strokeOpacity="0.5" 
                      strokeDasharray="2 2"
                    />
                    <circle 
                      cx={hoveredPoint.x} 
                      cy={hoveredPoint.y} 
                      r="5.5" 
                      fill={strokeColor} 
                      stroke="#0D0F16" 
                      strokeWidth="2" 
                    />
                  </g>
                )}
              </svg>

              {/* Tooltip Card Overlay inside Chart with Date & Time Info */}
              {hoveredPoint && (() => {
                const ptCoordinate = pointsCoordinates.find(p => p.index === hoveredPoint.index);
                const ptDate = getPointDateTime(hoveredPoint.index, ptCoordinate);
                
                const pad = (num: number) => String(num).padStart(2, '0');
                const timeStr = `${pad(ptDate.getHours())}:${pad(ptDate.getMinutes())}`;
                const dateStr = ptDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
                const fullTimestamp = `${dateStr} ${timeStr}`;

                const o = ptCoordinate?.open ?? hoveredPoint.price;
                const h = ptCoordinate?.high ?? hoveredPoint.price;
                const l = ptCoordinate?.low ?? hoveredPoint.price;
                const c = ptCoordinate?.close ?? hoveredPoint.price;

                return (
                  <div 
                    className="absolute bg-[#08090C]/95 border border-slate-800 p-3 rounded-xl pointer-events-none text-left shadow-2xl font-mono text-[10px] leading-relaxed flex flex-col gap-1.5 z-10 animate-fade-in w-44 backdrop-blur-sm"
                    style={{
                      left: `${Math.min(Math.max(4, (hoveredPoint.x / svgWidth) * 100 - 22), 64)}%`,
                      top: '12px'
                    }}
                  >
                    <div className="border-b border-slate-800/80 pb-1.5 mb-1 flex flex-col">
                      <span className="text-[8px] uppercase font-bold text-sky-400 tracking-wider">Lilin Historis</span>
                      <span className="text-[9px] text-slate-400 font-bold mt-0.5">{fullTimestamp}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Open:</span>
                        <span className="text-slate-300 font-bold">{o.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Close:</span>
                        <span className="text-slate-300 font-bold">{c.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between col-span-2 border-t border-slate-900/60 my-0.5"></div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">High:</span>
                        <span className="text-emerald-400 font-bold">{h.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Low:</span>
                        <span className="text-rose-400 font-bold">{l.toFixed(3)}</span>
                      </div>
                    </div>
                    <div className="mt-1 border-t border-slate-800/60 pt-1.5 flex justify-between items-center text-[9.5px]">
                      <span className="text-slate-400 font-bold">Harga Rata:</span>
                      <span className="text-yellow-400 font-extrabold">{c.toFixed(3)} cc</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* OHLC STATS ROW */}
        <div className="p-4 grid grid-cols-4 gap-2 border-t border-slate-900 bg-[#090A0E]/30 text-center font-mono">
          <div>
            <span className="block text-[8px] uppercase font-bold text-slate-500 tracking-wider">Open</span>
            <span className="text-xs text-slate-300 mt-0.5 block">{openPrice.toFixed(3)}</span>
          </div>
          <div>
            <span className="block text-[8px] uppercase font-bold text-slate-500 tracking-wider">High</span>
            <span className="text-xs text-emerald-400 font-bold mt-0.5 block">{highPrice.toFixed(3)}</span>
          </div>
          <div>
            <span className="block text-[8px] uppercase font-bold text-slate-500 tracking-wider">Low</span>
            <span className="text-xs text-rose-400 font-bold mt-0.5 block">{lowPrice.toFixed(3)}</span>
          </div>
          <div>
            <span className="block text-[8px] uppercase font-bold text-slate-500 tracking-wider">Close</span>
            <span className="text-xs text-slate-300 mt-0.5 block">{closePrice.toFixed(3)}</span>
          </div>
        </div>

        {/* FOOTER MARKET OFFERS */}
        <div className="p-4 border-t border-slate-900 bg-[#0A0B10] flex justify-between items-center text-[10.5px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[9px] uppercase font-bold">Best Buy (Bid)</span>
            <span className="text-emerald-400 font-bold">{topBuy}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[9px] uppercase font-bold">Best Sell (Ask)</span>
            <span className="text-rose-400 font-bold">{topSell}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
