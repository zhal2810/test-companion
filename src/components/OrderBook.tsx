import React from 'react';
import type { MarketOrder } from '../api/apiClient';
import { formatPrice } from '../utils/priceHelper';

interface OrderBookProps {
  buyOrders: MarketOrder[];
  sellOrders: MarketOrder[];
  loading?: boolean;
  error?: string;
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return Number(value || 0).toLocaleString('id-ID', {
    maximumFractionDigits,
  });
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function OrderTable({
  title,
  side,
  orders,
  loading,
}: {
  title: string;
  side: 'buy' | 'sell';
  orders: MarketOrder[];
  loading?: boolean;
}) {
  const visibleOrders = orders.slice(0, 10);
  const isBuy = side === 'buy';

  return (
    <div className="border border-slate-800/70 rounded-xl overflow-hidden bg-[#07080C]">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800/60 bg-slate-900/30">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isBuy ? 'bg-emerald-400' : 'bg-rose-400'
            }`}
          />
          <span
            className={`text-[10px] font-black uppercase tracking-wider ${
              isBuy ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {title}
          </span>
        </div>

        <span className="text-[9px] font-bold text-slate-500">
          {visibleOrders.length} Orders
        </span>
      </div>

      <div className="grid grid-cols-12 px-3 py-1.5 border-b border-slate-800/40 text-[8px] uppercase tracking-wider font-bold text-slate-600">
        <div className="col-span-3">Pemain</div>
        <div className="col-span-2 text-right">Harga</div>
        <div className="col-span-2 text-right">Jumlah</div>
        <div className="col-span-2 text-right">Total</div>
        <div className="col-span-3 text-right">Waktu</div>
      </div>

      {loading && visibleOrders.length === 0 ? (
        <div className="py-6 text-center text-[10px] text-slate-600 animate-pulse">
          Memuat order...
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="py-6 text-center text-[10px] text-slate-600">
          Tidak ada order.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/30">
          {visibleOrders.map((order, index) => {
            const total = Number(order.price || 0) * Number(order.quantity || 0);

            return (
              <div
                key={order._id || `${order.user}-${order.offerAt}-${index}`}
                className="grid grid-cols-12 items-center px-3 py-1.5 hover:bg-slate-900/30 transition"
              >
                <div className="col-span-3 min-w-0 flex items-center gap-1.5">
                  {order.avatarUrl ? (
                    <img
                      src={order.avatarUrl}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover border border-slate-800 shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-800 shrink-0" />
                  )}

                  <span
                    className="text-[9.5px] font-bold text-slate-300 truncate"
                    title={order.username || order.user || 'Unknown'}
                  >
                    {order.username || order.user?.slice(0, 8) || 'Unknown'}
                  </span>
                </div>

                <div
                  className={`col-span-2 text-right text-[9.5px] font-mono font-black ${
                    isBuy ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatPrice(order.price)}
                </div>

                <div className="col-span-2 text-right text-[9px] font-mono text-slate-300">
                  {formatNumber(order.quantity)}
                </div>

                <div className="col-span-2 text-right text-[9px] font-mono text-slate-400">
                  ${formatNumber(total, 2)}
                </div>

                <div className="col-span-3 text-right text-[8.5px] font-mono text-slate-600">
                  {formatTime(order.offerAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OrderBook({
  buyOrders,
  sellOrders,
  loading = false,
  error = '',
}: OrderBookProps) {
  const bidVolume = buyOrders.reduce(
    (sum, order) => sum + Number(order.quantity || 0),
    0,
  );

  const offerVolume = sellOrders.reduce(
    (sum, order) => sum + Number(order.quantity || 0),
    0,
  );

  const ratio =
    offerVolume > 0 ? bidVolume / offerVolume : bidVolume > 0 ? Infinity : 0;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Bursa Pasar · Bid & Offer
          </div>
          <div className="text-[9px] text-slate-600 mt-0.5">
            10 order terbaik ditampilkan dari data order book.
          </div>
        </div>

        <div className="text-right">
          <div className="text-[8px] uppercase tracking-wider text-slate-600 font-bold">
            Rasio Supply / Demand
          </div>
          <div className="text-xs font-mono font-black text-slate-300">
            {Number.isFinite(ratio) ? ratio.toFixed(2) : '∞'}
          </div>
        </div>
      </div>

      {error ? (
        <div className="border border-rose-500/20 bg-rose-950/10 rounded-lg px-3 py-2 text-[9px] text-rose-400">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
        <OrderTable
          title="Daftar Order Beli (BUY / BID)"
          side="buy"
          orders={buyOrders}
          loading={loading}
        />
        <OrderTable
          title="Daftar Order Jual (SELL / OFFER)"
          side="sell"
          orders={sellOrders}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-emerald-500/15 bg-emerald-950/10 px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-wider text-emerald-500/70 font-bold">
            Bid Vol
          </div>
          <div className="text-xs font-mono font-black text-emerald-400">
            {formatNumber(bidVolume)}
          </div>
        </div>

        <div className="rounded-lg border border-rose-500/15 bg-rose-950/10 px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-wider text-rose-500/70 font-bold">
            Offer Vol
          </div>
          <div className="text-xs font-mono font-black text-rose-400">
            {formatNumber(offerVolume)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/20 px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-wider text-slate-600 font-bold">
            Data API
          </div>
          <div className="text-xs font-mono font-black text-slate-300">
            {buyOrders.length + sellOrders.length} orders
          </div>
        </div>
      </div>
    </section>
  );
}
