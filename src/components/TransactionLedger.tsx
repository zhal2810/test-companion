import React from 'react';
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft, Calendar, FileText, AlertCircle } from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import { GAME_ITEMS } from '../data/gameConfig';

function formatMoney(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return "0";

  const absValue = Math.abs(value);

  // Jika 1.000 atau lebih, format ke "K"
  if (absValue >= 1000) {
    return (value / 1000).toFixed(1).replace(/\.0$/, '') + "K";
  }

  // Jika di bawah 1.000, tampilkan hingga 2 angka di belakang titik
  return parseFloat(value.toFixed(2)).toString();
}

function formatDate(dateString: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }); // Hasil: "27 Jun, 18:17"
}

interface Transaction {
  _id: string;
  createdAt: string;
  transactionType: string;
  money?: number;
  amount?: number;
  price?: number;
  sellerId?: string;
  buyerId?: string;
  itemCode?: string;
  quantity?: number;
}

interface EnrichedTransaction extends Transaction {
  moneySafe: number;
  profitThisTx: number | null;
  displayLabel: string;
  direction?: 'income' | 'expense' | 'buy' | 'sell' | 'neutral';
}

interface LedgerResult {
  rows: EnrichedTransaction[];
  itemBreakdown: any[];
  totalIncome: number;
  totalExpense: number;
  netWealth: number;
  totalBoughtMoney: number;
  totalSoldMoney: number;
  totalWagePaid: number;
  totalWageReceived: number;
}

// --- LOGIKA AKUNTANSI (SMART LEDGER) ---
function calculateLedger(transactions: Transaction[], userId: string): LedgerResult {
  // Urutkan dari terlama ke terbaru agar HPP (Harga Pokok) akurat
  const sortedTx = [...transactions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const itemState: Record<string, { avgCost: number; qtyHeld: number }> = {};
  const itemSummary: Record<string, {
    itemCode: string; totalBoughtQty: number; totalSoldQty: number;
    totalBoughtMoney: number; totalSoldMoney: number; profit: number; hasUnknownCost: boolean;
  }> = {};
  
  const enrichedRows: EnrichedTransaction[] = [];

  let totalWagePaid = 0;
  let totalWageReceived = 0;
  let totalBoughtMoney = 0;
  let totalSoldMoney = 0;

  for (const tx of sortedTx) {
    // SAFE MONEY GETTER
    const moneySafe = tx.money || tx.amount || tx.price || 0;

    // Siapkan objek baris untuk UI Tabel
    const enrichedTx: EnrichedTransaction = {
      ...tx,
      moneySafe,
      profitThisTx: null,
      displayLabel: tx.transactionType // Default label
    };

    // 1. CEK JIKA INI TRANSAKSI GAJI (WAGE)
    if (tx.transactionType === 'wage') {
      if (tx.sellerId === userId) {
        totalWageReceived += moneySafe;
        enrichedTx.direction = 'income';
        enrichedTx.displayLabel = '💰 Gaji Saya (Kerja)';
      } else if (tx.buyerId === userId) {
        totalWagePaid += moneySafe;
        enrichedTx.direction = 'expense';
        enrichedTx.displayLabel = '💸 Bayar Karyawan';
      }
    }
    // 2. CEK JIKA INI JUAL/BELI (TRADING & ITEM MARKET)
    else if (['trading', 'itemMarket'].includes(tx.transactionType)) {
      const itemCode = tx.itemCode || 'unknown';
      const qty = tx.quantity || 0;
      const configItem = GAME_ITEMS[itemCode] || GAME_ITEMS[itemCode.toLowerCase()];
      const itemDisplayName = configItem?.name || itemCode;

      if (!itemSummary[itemCode]) {
        itemSummary[itemCode] = {
          itemCode, totalBoughtQty: 0, totalSoldQty: 0,
          totalBoughtMoney: 0, totalSoldMoney: 0, profit: 0, hasUnknownCost: false
        };
      }
      const summary = itemSummary[itemCode];
      const isBuy = tx.buyerId === userId;
      const isSell = tx.sellerId === userId;

      if (isBuy) {
        summary.totalBoughtQty += qty;
        summary.totalBoughtMoney += moneySafe;
        totalBoughtMoney += moneySafe;
        summary.profit -= moneySafe;

        if (!itemState[itemCode]) itemState[itemCode] = { avgCost: 0, qtyHeld: 0 };
        const state = itemState[itemCode];

        const newQtyHeld = state.qtyHeld + qty;
        const newTotalCost = state.avgCost * state.qtyHeld + moneySafe;
        state.avgCost = newQtyHeld > 0 ? newTotalCost / newQtyHeld : (qty > 0 ? moneySafe / qty : 0);
        state.qtyHeld = newQtyHeld;

        enrichedTx.direction = 'buy';
        enrichedTx.displayLabel = `🔻 Beli ${itemDisplayName}`;
      } else if (isSell) {
        summary.totalSoldQty += qty;
        summary.totalSoldMoney += moneySafe;
        totalSoldMoney += moneySafe;

        const state = itemState[itemCode];
        if (!state || state.qtyHeld < qty) {
          summary.hasUnknownCost = true;
          summary.profit += moneySafe;
          enrichedTx.profitThisTx = moneySafe;
        } else {
          const costBasis = state.avgCost * qty;
          enrichedTx.profitThisTx = moneySafe - costBasis;
          summary.profit += enrichedTx.profitThisTx;
          state.qtyHeld -= qty;
        }

        enrichedTx.direction = 'sell';
        enrichedTx.displayLabel = `🔺 Jual ${itemDisplayName}`;
      }
    }
    // 3. TIPE LAINNYA (Tip, Donasi, Open Case, dll)
    else {
      if (tx.buyerId === userId) {
        enrichedTx.direction = 'expense';
        enrichedTx.displayLabel = `➖ ${tx.transactionType}`;
      } else if (tx.sellerId === userId) {
        enrichedTx.direction = 'income';
        enrichedTx.displayLabel = `➕ ${tx.transactionType}`;
      } else {
        enrichedTx.direction = 'neutral';
        enrichedTx.displayLabel = `📌 ${tx.transactionType}`;
      }
    }

    enrichedRows.push(enrichedTx);
  }

  // REKAP KEKAYAAN BERSIH
  const totalIncome = totalSoldMoney + totalWageReceived;
  const totalExpense = totalBoughtMoney + totalWagePaid;
  const netWealth = totalIncome - totalExpense;

  return {
    rows: enrichedRows.reverse(),
    itemBreakdown: Object.values(itemSummary),
    totalIncome,
    totalExpense,
    netWealth,
    totalBoughtMoney,
    totalSoldMoney,
    totalWagePaid,
    totalWageReceived
  };
}

interface TransactionLedgerProps {
  transactions: Transaction[];
  userId: string;
  filterActive?: boolean;
}

export default function TransactionLedger({ transactions, userId, filterActive = false }: TransactionLedgerProps) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="bg-[#12141C] border border-slate-800 rounded-xl p-6 text-center">
        <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2.5" />
        <h3 className="text-sm font-bold text-slate-300">DOMPET EKONOMI</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
          {filterActive
            ? 'Tidak ada transaksi untuk periode/jenis terpilih. Coba ubah filter Periode/Jenis atau klik Load More untuk riwayat yang lebih dalam.'
            : 'Belum ada data transaksi. Hubungkan akun di menu Config untuk sinkronisasi.'}
        </p>
      </div>
    );
  }

  const { rows, itemBreakdown, totalIncome, totalExpense, netWealth, totalBoughtMoney, totalSoldMoney } = calculateLedger(transactions, userId);

  return (
    <div className="bg-[#10121A]/80 backdrop-blur-md border border-slate-800/80 rounded-xl p-5 md:p-6 text-slate-100">
      
      {/* HEADER SECTION */}
      <div className="flex items-center gap-2 mb-5">
        <Wallet className="w-5 h-5 text-emerald-400" />
        <h3 className="text-base font-bold tracking-tight text-white uppercase">
          Dompet Ekonomi
        </h3>
      </div>

      {/* 1. TOP BAR (RINGKASAN KEKAYAAN) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
        <SummaryBox 
          label="Total Pemasukan" 
          value={<>+{formatMoney(totalIncome)} <CurrencyIcon /></>} 
          highlight="positive" 
          icon={<ArrowUpRight className="w-4 h-4 text-emerald-400" />}
        />
        <SummaryBox 
          label="Total Pengeluaran" 
          value={<>-{formatMoney(totalExpense)} <CurrencyIcon /></>} 
          highlight="negative" 
          icon={<ArrowDownLeft className="w-4 h-4 text-rose-400" />}
        />
        <SummaryBox 
          label="Kekayaan Bersih" 
          value={<>{netWealth >= 0 ? '+' : ''}{formatMoney(netWealth)} <CurrencyIcon /></>} 
          highlight={netWealth >= 0 ? 'positive' : 'negative'} 
          icon={<Wallet className="w-4 h-4 text-emerald-400" />}
        />
      </div>

      {/* 2. RIWAYAT TRADING (Grid Layout) */}
      <div className="mb-6">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pb-1 border-b border-slate-800/80">
          Ringkasan Niaga Komoditas
        </h4>

        {itemBreakdown.length === 0 ? (
          <div className="flex items-start gap-2 p-3 bg-slate-900/40 border border-slate-800/40 rounded-lg text-xs text-slate-500">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Belum ada transaksi niaga pada periode/filter terpilih. Coba ubah filter Periode/Jenis atau klik Load More untuk riwayat yang lebih dalam.</span>
          </div>
        ) : (
          <>
            {/* Desktop View Table */}
            <div className="hidden sm:block">
              <div className="grid grid-cols-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 px-2">
                <span>Item</span>
                <span>Arah</span>
                <span className="text-right">Rata-Rata</span>
                <span className="text-right">Kumulatif</span>
              </div>
              <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar">
                {itemBreakdown.map((item) => {
                  const configItem = GAME_ITEMS[item.itemCode] || GAME_ITEMS[item.itemCode.toLowerCase()];
                  const displayName = configItem?.name || item.itemCode;
                  return (
                    <div 
                      key={item.itemCode} 
                      className="grid grid-cols-4 text-xs py-2 px-2.5 bg-slate-900/20 border border-slate-800/40 rounded-lg hover:border-slate-700/50 transition duration-150 items-center"
                    >
                      <span className="font-bold text-slate-200 uppercase">{displayName}</span>
                      <span className={`text-[10px] font-bold ${item.totalBoughtQty > 0 ? 'text-amber-500/90' : 'text-sky-500/90'}`}>
                        {item.totalBoughtQty > 0 ? 'BELI' : 'JUAL'}
                      </span>
                      <span className="text-right text-slate-300 font-mono">
                        {formatMoney(item.totalBoughtQty > 0 ? (item.totalBoughtMoney / item.totalBoughtQty) : (item.totalSoldMoney / item.totalSoldQty))}
                      </span>
                      <span className="text-right text-white font-mono font-bold">
                        {formatMoney(item.totalBoughtQty > 0 ? item.totalBoughtMoney : item.totalSoldMoney)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile View Stacked List */}
            <div className="sm:hidden space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {itemBreakdown.map((item) => {
                const isBuy = item.totalBoughtQty > 0;
                const configItem = GAME_ITEMS[item.itemCode] || GAME_ITEMS[item.itemCode.toLowerCase()];
                const displayName = configItem?.name || item.itemCode;
                return (
                  <div 
                    key={item.itemCode}
                    className="bg-slate-900/20 border border-slate-800/40 rounded-lg p-3 hover:border-slate-700/50 transition duration-150 flex justify-between items-center text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-200 uppercase">{displayName}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold ${isBuy ? 'text-amber-500 bg-amber-500/10 border border-amber-500/10' : 'text-sky-400 bg-sky-400/10 border border-sky-400/10'}`}>
                        {isBuy ? 'BELI' : 'JUAL'}
                      </span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="text-[10px] text-slate-400">
                        Avg: <span className="font-mono text-slate-200 font-semibold">{formatMoney(isBuy ? (item.totalBoughtMoney / item.totalBoughtQty) : (item.totalSoldMoney / item.totalSoldQty))}</span>
                      </div>
                      <div className="font-mono font-bold text-white text-xs flex items-center justify-end gap-1">
                        {formatMoney(isBuy ? item.totalBoughtMoney : item.totalSoldMoney)} <CurrencyIcon />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Footer Total Kumulatif */}
        <div className="mt-3.5 py-2.5 px-3 bg-slate-950/40 border border-slate-800/60 rounded-lg flex flex-col xs:flex-row justify-between items-start xs:items-center gap-2 text-xs font-mono">
          <span className="text-slate-500">Total Modal Niaga:</span>
          <div className="flex gap-4">
            <span className="inline-flex items-center gap-1">Beli: <strong className="text-amber-500 inline-flex items-center gap-1">{formatMoney(totalBoughtMoney)} <CurrencyIcon /></strong></span>
            <span className="text-slate-700">|</span>
            <span className="inline-flex items-center gap-1">Jual: <strong className="text-sky-400 inline-flex items-center gap-1">{formatMoney(totalSoldMoney)} <CurrencyIcon /></strong></span>
          </div>
        </div>
      </div>

      {/* 3. RIWAYAT TRANSAKSI (SEMUA TIPE) */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pb-1 border-b border-slate-800/80">
          Semua Mutasi Ledger
        </h4>

        {/* Desktop View Table */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 px-2">
            <span>Waktu</span>
            <span>Aktivitas</span>
            <span className="text-right">Volume (cc)</span>
            <span className="text-right">Net Profit</span>
          </div>

          <div className="max-h-[260px] overflow-y-auto space-y-1 pr-1.5 custom-scrollbar">
            {rows.map((tx) => {
              const isOut = tx.direction === 'buy' || tx.direction === 'expense';
              return (
                <div
                  key={tx._id}
                  className="grid grid-cols-4 text-xs py-2 px-2.5 border border-transparent hover:border-slate-800 hover:bg-slate-900/10 rounded-lg transition duration-150 items-center"
                >
                  {/* Tanggal */}
                  <span className="text-slate-500 text-[10.5px] font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-600" />
                    {formatDate(tx.createdAt)}
                  </span>

                  {/* Aktivitas */}
                  <span className={`font-medium truncate ${isOut ? 'text-amber-500/95' : 'text-sky-400/95'}`}>
                    {tx.displayLabel} {tx.quantity ? <span className="text-slate-600 font-mono">({tx.quantity}u)</span> : ''}
                  </span>

                  {/* Nilai Transaksi */}
                  <span className="text-right text-slate-200 font-mono font-medium">
                    {formatMoney(tx.moneySafe)}
                  </span>

                  {/* Profit (Khusus Jual Barang) */}
                  <span className="text-right font-mono text-xs">
                    {tx.profitThisTx !== null ? (
                      <span className={tx.profitThisTx >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {tx.profitThisTx >= 0 ? '+' : ''}{formatMoney(tx.profitThisTx)}
                      </span>
                    ) : (
                      <span className="text-slate-800">—</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile View Stacked List */}
        <div className="sm:hidden space-y-2 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
          {rows.map((tx) => {
            const isOut = tx.direction === 'buy' || tx.direction === 'expense';
            return (
              <div
                key={tx._id}
                className="bg-slate-900/10 hover:bg-slate-900/20 border border-slate-800/40 hover:border-slate-700/40 p-3 rounded-lg transition duration-150 flex justify-between items-center text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <span className={`font-bold block truncate ${isOut ? 'text-amber-500/95' : 'text-sky-400/95'}`}>
                    {tx.displayLabel} {tx.quantity ? <span className="text-slate-500 font-mono text-[10px]">({tx.quantity}u)</span> : ''}
                  </span>
                  <span className="text-slate-500 text-[10px] font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-600 shrink-0" />
                    {formatDate(tx.createdAt)}
                  </span>
                </div>
                
                <div className="text-right space-y-1 shrink-0 ml-3">
                  <span className="text-slate-200 font-mono font-medium flex items-center justify-end gap-1">
                    {formatMoney(tx.moneySafe)} <CurrencyIcon />
                  </span>
                  {tx.profitThisTx !== null ? (
                    <span className={`text-[10px] font-mono block font-bold ${tx.profitThisTx >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      Profit: {tx.profitThisTx >= 0 ? '+' : ''}{formatMoney(tx.profitThisTx)}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-[9px] block">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// Komponen Kotak Ringkasan
interface SummaryBoxProps {
  label: string;
  value: React.ReactNode;
  highlight: 'positive' | 'negative';
  icon: React.ReactNode;
}

function SummaryBox({ label, value, highlight, icon }: SummaryBoxProps) {
  const isPositive = highlight === 'positive';
  const borderColorClass = isPositive ? 'border-emerald-500/15' : 'border-rose-500/15';
  const valColorClass = isPositive ? 'text-emerald-400' : 'text-rose-400';

  return (
    <div className={`bg-[#0C0D13] p-3.5 rounded-lg border ${borderColorClass} flex items-center justify-between`}>
      <div>
        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
          {label}
        </div>
        <div className={`text-sm md:text-base font-mono font-bold ${valColorClass} flex items-center gap-1`}>
          {value}
        </div>
      </div>
      <div className="bg-slate-900/50 p-2 rounded-md border border-slate-800/40">
        {icon}
      </div>
    </div>
  );
}