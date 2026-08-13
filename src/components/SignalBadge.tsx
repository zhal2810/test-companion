import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { TradeSignal } from '../utils/signalEngine';

interface SignalBadgeProps {
  signal: TradeSignal;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showIcon?: boolean;
}

export function SignalBadge({ 
  signal, 
  size = 'md', 
  showLabel = true,
  showIcon = true 
}: SignalBadgeProps) {
  const config = {
    buy: { 
      label: 'BUY',
      className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-lg shadow-emerald-500/10',
      icon: <TrendingUp className={`w-${size === 'sm' ? '3' : size === 'md' ? '4' : '5'} h-${size === 'sm' ? '3' : size === 'md' ? '4' : '5'}`} />
    },
    sell: { 
      label: 'SELL',
      className: 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-lg shadow-rose-500/10',
      icon: <TrendingDown className={`w-${size === 'sm' ? '3' : size === 'md' ? '4' : '5'} h-${size === 'sm' ? '3' : size === 'md' ? '4' : '5'}`} />
    },
    hold: { 
      label: 'HOLD',
      className: 'bg-slate-500/20 text-slate-400 border-slate-500/40 shadow-lg shadow-slate-500/10',
      icon: <Minus className={`w-${size === 'sm' ? '3' : size === 'md' ? '4' : '5'} h-${size === 'sm' ? '3' : size === 'md' ? '4' : '5'}`} />
    },
  }[signal];

  const sizeClass = {
    sm: 'text-[11px] px-1.5 py-0.5 gap-0.5',
    md: 'text-xs px-2.5 py-1 gap-1',
    lg: 'text-sm px-3 py-1.5 gap-1.5'
  }[size];

  return (
    <div className={`inline-flex items-center border rounded-full font-bold ${sizeClass} ${config.className}`}>
      {showIcon && config.icon}
      {showLabel && <span className="uppercase tracking-wider">{config.label}</span>}
    </div>
  );
}
