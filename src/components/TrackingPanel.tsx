import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Calendar,
  Filter,
  Wallet,
  Package,
  History,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import ItemIcon from './ItemIcon';
import { GAME_ITEMS } from '../data/gameConfig';
import { computeFifo, Flip, Position } from '../utils/fifo';

interface TrackerProps {
  token?: string | null;
}

interface TradeRaw {
  _id: string;
  itemCode: string;
  money: number;
  quantity: number;
  unitPrice: number;
  sellerId: string;
  buyerId: string;
  sellerName: string;
  buyerName: string;
  sellerCountryId: string;
  buyerCountryId: string;
  transactionType: string;
  createdAt: string;
}

interface TrackerResponse {
  success: boolean;
  error?: string;
  data?: {
    countryId: string;
    fetchedAt: string;
    total: number;
    transactions: TradeRaw[];
  };
}

const DEFAULT_COUNTRY_ID = '6813b6d546e731854c7ac829'; // Indonesia

const TRANSACTION_TYPES = ['trading', 'itemMarket', 'donation'];

function formatMoney(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return '0';
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    return (value / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return parseFloat(value.toFixed(2)).toString();
}

function formatFullMoney(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return '0';
  return value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function formatDate(dateString: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getItemName(itemCode: string): string {
  if (!itemCode) return '—';
  const config = GAME_ITEMS[itemCode] || GAME_ITEMS[itemCode.toLowerCase()];
  return config?.name || itemCode;
}

function formatHolding(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}h ${hours % 24}j`;
}

export default function TrackingPanel({ token }: TrackerProps) {
  const [rawTransactions, setRawTransactions] = useState<TradeRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [countryId, setCountryId] = useState(DEFAULT_COUNTRY_ID);

  // Filters
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const loadTransactions = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ countryId });
        const headers: Record<string, string> = {};
        if (token) headers['X-API-Key'] = token;
        if (force) {
          // Bypass cache
          params.set('_', String(Date.now()));
        }
        const response = await fetch(`/api/tracker/transactions?${params.toString()}`, { headers });
        const json: TrackerResponse = await response.json();
        if (!json.success || !json.data) {
          throw new Error(json.error || 'Gagal memuat transaksi');
        }
        setRawTransactions(json.data.transactions);
        setFetchedAt(json.data.fetchedAt);
      } catch (err: any) {
        setError(err.message || 'Terjadi kesalahan');
      } finally {
        setLoading(false);
      }
    },
    [countryId, token],
  );

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rawTransactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.transactionType !== typeFilter) return false;
      if (dateFrom && new Date(tx.createdAt).getTime() < new Date(dateFrom).getTime()) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(tx.createdAt).getTime() > to.getTime()) return false;
      }
      if (q) {
        const itemName = getItemName(tx.itemCode).toLowerCase();
        const matchesItem = itemName.includes(q) || (tx.itemCode || '').toLowerCase().includes(q);
        const matchesSeller = (tx.sellerName || '').toLowerCase().includes(q);
        const matchesBuyer = (tx.buyerName || '').toLowerCase().includes(q);
        if (!matchesItem && !matchesSeller && !matchesBuyer) return false;
      }
      return true;
    });
  }, [rawTransactions, search, dateFrom, dateTo, typeFilter]);

  // Tentukan sisi trade dari perspektif negara (countryId).
  const trades = useMemo(() => {
    return filtered
      .filter((tx) => tx.itemCode && tx.quantity > 0)
      .map((tx) => {
        const isBuy = tx.buyerCountryId === countryId;
        const isSell = tx.sellerCountryId === countryId;
        const side = isBuy ? 'buy' : isSell ? 'sell' : null;
        if (!side) return null;
        const time = new Date(tx.createdAt).getTime();
        if (!Number.isFinite(time)) return null;
        return {
          _id: tx._id,
          itemCode: tx.itemCode,
          side: side as 'buy' | 'sell',
          quantity: tx.quantity,
          unitPrice: tx.unitPrice,
          time,
          counterpartyName: isBuy ? tx.sellerName : tx.buyerName,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
  }, [filtered, countryId]);

  const fifo = useMemo(() => computeFifo(trades), [trades]);

  // Market value pakai harga pasar dari itemTrading.getPrices
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/players/itemTrading.getPrices');
        const json = await res.json();
        const data = json?.data ?? json?.result?.data ?? {};
        const map: Record<string, number> = {};
        if (data && typeof data === 'object') {
          Object.entries(data).forEach(([key, value]: [string, any]) => {
            if (typeof value === 'number') map[key.toLowerCase()] = value;
            else if (value && typeof value === 'object') {
              map[key.toLowerCase()] = value.avg ?? value.price ?? value.value ?? 0;
            }
          });
        }
        if (!cancelled) setMarketPrices(map);
      } catch {
        // Biarkan kosong
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const positionsWithValue: (Position & { marketValue: number; unrealized: number; pnlPct: number })[] =
    useMemo(() => {
      return fifo.positions.map((p) => {
        const market = marketPrices[p.itemCode.toLowerCase()] ?? p.avgCost;
        const marketValue = market * p.quantity;
        const unrealized = marketValue - p.totalCost;
        const pnlPct = p.totalCost > 0 ? (unrealized / p.totalCost) * 100 : 0;
        return { ...p, marketValue, unrealized, pnlPct };
      });
    }, [fifo.positions, marketPrices]);

  const winRate = useMemo(() => {
    if (fifo.flips.length === 0) return 0;
    const wins = fifo.flips.filter((f) => f.profit > 0).length;
    return (wins / fifo.flips.length) * 100;
  }, [fifo.flips]);

  const totalRealized = useMemo(
    () => fifo.flips.reduce((sum, f) => sum + f.profit, 0),
    [fifo.flips],
  );

  const avgFlipReturn = useMemo(() => {
    if (fifo.flips.length === 0) return 0;
    const totalCost = fifo.flips.reduce((s, f) => s + f.buyUnitPrice * f.buyQty, 0);
    return totalCost > 0 ? (totalRealized / totalCost) * 100 : 0;
  }, [fifo.flips, totalRealized]);

  const hasFilters = search !== '' || dateFrom !== '' || dateTo !== '' || typeFilter !== 'all';

  const filterChipClass =
    'bg-[#0C0D13] border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 flex items-center gap-2 outline-none focus:border-sky-500/50';

  return (
    <div className="space-y-4">
      {/* HEADER CONTROLS */}
      <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tracking Negara</span>
            {fetchedAt && (
              <span className="text-[10px] text-slate-600">
                terakhir {formatDate(fetchedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadTransactions(true)}
              disabled={loading}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition duration-150 cursor-pointer disabled:text-slate-600 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* SEARCH */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari item, penjual, atau pembeli..."
            className="w-full bg-[#08090C] border border-slate-800 focus:border-sky-500/50 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600"
          />
        </div>

        {/* FILTERS ROW */}
        <div className="flex flex-wrap items-center gap-2">
          <div className={`${filterChipClass} !cursor-pointer`}>
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent outline-none text-slate-300 w-32"
            />
            <span className="text-slate-600">s/d</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent outline-none text-slate-300 w-32"
            />
          </div>

          <div className={`${filterChipClass} !cursor-pointer`}>
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent outline-none text-slate-300 cursor-pointer"
            >
              <option value="all">Semua Tipe</option>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setSearch('');
                setDateFrom('');
                setDateTo('');
                setTypeFilter('all');
              }}
              className="text-[11px] text-slate-500 hover:text-slate-300 px-2 py-1 transition cursor-pointer"
            >
              ✕ Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* LOADING / ERROR */}
      {loading && (
        <div className="bg-[#0C0D13] border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-sky-500" />
          <span className="text-xs text-slate-400">Memuat transaksi negara...</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-rose-400">Gagal memuat data</h4>
            <p className="text-xs text-rose-300/70 mt-1">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* SUMMARY STATS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Wallet className="w-3 h-3" /> Cost Basis
              </div>
              <div className="text-lg font-black font-mono text-slate-100 flex items-center gap-1 mt-1">
                {formatMoney(fifo.totalCostBasis)} <CurrencyIcon className="w-3.5 h-3.5" />
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {fifo.positions.length} posisi terbuka
              </div>
            </div>

            <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Realized Profit
              </div>
              <div className={`text-lg font-black font-mono mt-1 flex items-center gap-1 ${totalRealized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalRealized >= 0 ? '+' : ''}{formatMoney(totalRealized)} <CurrencyIcon className="w-3.5 h-3.5" />
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {fifo.flips.length} flip {fifo.flips.length === 1 ? 'selesai' : 'selesai'} · Win Rate {winRate.toFixed(0)}%
              </div>
            </div>

            <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Unrealized P&L
              </div>
              <div className={`text-lg font-black font-mono mt-1 flex items-center gap-1 ${positionsWithValue.reduce((s, p) => s + p.unrealized, 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {positionsWithValue.reduce((s, p) => s + p.unrealized, 0) >= 0 ? '+' : ''}
                {formatMoney(positionsWithValue.reduce((s, p) => s + p.unrealized, 0))} <CurrencyIcon className="w-3.5 h-3.5" />
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {formatFullMoney(positionsWithValue.reduce((s, p) => s + p.marketValue, 0))} nilai pasar
              </div>
            </div>

            <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Package className="w-3 h-3" /> Volume
              </div>
              <div className="text-lg font-black font-mono text-slate-100 mt-1">
                {filtered.length.toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                transaksi {hasFilters ? '(terfilter)' : ''}
              </div>
            </div>
          </div>

          {/* CURRENT POSITIONS */}
          <div className="bg-[#0C0D13] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-sky-400" /> Current Positions
              </h3>
              <span className="text-[10px] text-slate-500">{positionsWithValue.length} posisi</span>
            </div>

            {positionsWithValue.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Belum ada posisi terbuka untuk periode & filter ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[560px]">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
                      <th className="px-3 py-2 font-bold">Item</th>
                      <th className="px-3 py-2 font-bold text-right">Qty</th>
                      <th className="px-3 py-2 font-bold text-right">Avg Cost</th>
                      <th className="px-3 py-2 font-bold text-right">Total Cost</th>
                      <th className="px-3 py-2 font-bold text-right">Mkt Value</th>
                      <th className="px-3 py-2 font-bold text-right">Unrealized</th>
                      <th className="px-3 py-2 font-bold text-right">P&L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionsWithValue.map((p) => (
                      <tr key={p.itemCode} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                              <ItemIcon itemCode={p.itemCode} size="sm" className="w-full h-full object-contain" />
                            </div>
                            <span className="font-semibold text-slate-200">{getItemName(p.itemCode)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{p.quantity.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{formatMoney(p.avgCost)}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{formatMoney(p.totalCost)}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{formatMoney(p.marketValue)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${p.unrealized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {p.unrealized >= 0 ? '+' : ''}{formatMoney(p.unrealized)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${p.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* COMPLETED FLIPS */}
          <div className="bg-[#0C0D13] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-emerald-400" /> Completed Flips
              </h3>
              <span className="text-[10px] text-slate-500">{fifo.flips.length} flip</span>
            </div>

            {fifo.flips.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Belum ada flip selesai (jual-beli) untuk periode & filter ini.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs min-w-[640px]">
                  <thead className="sticky top-0 bg-[#12141C]">
                    <tr className="text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
                      <th className="px-3 py-2 font-bold">Item</th>
                      <th className="px-3 py-2 font-bold text-right">Qty</th>
                      <th className="px-3 py-2 font-bold text-right">Beli</th>
                      <th className="px-3 py-2 font-bold text-right">Jual</th>
                      <th className="px-3 py-2 font-bold text-right">Holding</th>
                      <th className="px-3 py-2 font-bold text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fifo.flips.map((f, i) => (
                      <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                              <ItemIcon itemCode={f.itemCode} size="sm" className="w-full h-full object-contain" />
                            </div>
                            <span className="font-semibold text-slate-200">{getItemName(f.itemCode)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{f.buyQty.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 text-right font-mono text-amber-400">{formatMoney(f.buyUnitPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono text-sky-400">{formatMoney(f.sellUnitPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-400">{formatHolding(f.holdingMs)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${f.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {f.profit >= 0 ? '+' : ''}{formatMoney(f.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RECENT TRADES */}
          <div className="bg-[#0C0D13] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-sky-400" /> Recent Trades
              </h3>
              <span className="text-[10px] text-slate-500">{filtered.length} transaksi</span>
            </div>

            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Tidak ada transaksi untuk filter ini.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs min-w-[680px]">
                  <thead className="sticky top-0 bg-[#12141C]">
                    <tr className="text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
                      <th className="px-3 py-2 font-bold">Waktu</th>
                      <th className="px-3 py-2 font-bold">Item</th>
                      <th className="px-3 py-2 font-bold">Tipe</th>
                      <th className="px-3 py-2 font-bold">Arah</th>
                      <th className="px-3 py-2 font-bold">Lawan</th>
                      <th className="px-3 py-2 font-bold text-right">Qty</th>
                      <th className="px-3 py-2 font-bold text-right">Harga</th>
                      <th className="px-3 py-2 font-bold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 50).map((tx) => {
                      const isBuy = tx.buyerCountryId === countryId;
                      const isSell = tx.sellerCountryId === countryId;
                      return (
                        <tr key={tx._id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatDate(tx.createdAt)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                                <ItemIcon itemCode={tx.itemCode} size="sm" className="w-full h-full object-contain" />
                              </div>
                              <span className="font-semibold text-slate-200">{getItemName(tx.itemCode)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">{tx.transactionType}</span>
                          </td>
                          <td className="px-3 py-2">
                            {isBuy ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-bold"><TrendingUp className="w-3 h-3" /> BELI</span>
                            ) : isSell ? (
                              <span className="inline-flex items-center gap-1 text-rose-400 font-bold"><TrendingDown className="w-3 h-3" /> JUAL</span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-300">{isBuy ? tx.sellerName || '—' : tx.buyerName || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-300">{tx.quantity.toLocaleString('id-ID')}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-300">{formatMoney(tx.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-200">{formatMoney(tx.money)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
