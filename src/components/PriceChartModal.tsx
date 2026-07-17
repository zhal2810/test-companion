import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import ItemIcon from './ItemIcon';
import CandleChart from './CandleChart';

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
}

function formatVolume(value: any): string {
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return Math.round(num).toLocaleString('id-ID');
}

export default function PriceChartModal({ item, onClose }: PriceChartModalProps) {
  const [chartView, setChartView] = React.useState<'line' | 'candle'>('candle');
  const points = Array.isArray(item.points) ? item.points : [];
  const chartData = points.map((price, index) => ({ index, price }));

  const isUp = item.changeValue >= 0;
  const high = points.length ? Math.max(...points) : item.price;
  const low = points.length ? Math.min(...points) : item.price;

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
            <div className="text-lg font-mono font-black text-white">{Number(item.price).toFixed(3)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Perubahan</div>
            <div className={`text-lg font-mono font-black flex items-center gap-1 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {isUp ? '+' : ''}{item.changeValue.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Tertinggi / Terendah</div>
            <div className="text-sm font-mono font-bold text-slate-300">{high.toFixed(3)} / {low.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Volume</div>
            <div className="text-sm font-mono font-bold text-slate-300">{formatVolume(item.volume)}</div>
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
            <CandleChart itemCode={item.item} />
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
