import React from 'react';
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft, Calendar, FileText, AlertCircle } from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import ItemIcon from './ItemIcon';
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
      
      {/* HEADER SECTION - Daily P&L Tracker ala gambar tapi Indonesia */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold tracking-tight text-white uppercase">
            Pelacak P&amp;L Harian
          </h3>
          <span className="hidden sm:inline text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">Reset 02:00 WIB</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Hari Ini vs Kemarin</span>
      </div>

      {/* 1. DAILY P&L TRACKER TABLE - mirip screenshot */}
      {(() => {
        // Reset 02:00 WIB = pakai local time 02:00
        const now = new Date();
        const todayReset = new Date(now); todayReset.setHours(2,0,0,0);
        if (now < todayReset) todayReset.setDate(todayReset.getDate()-1);
        const yesterdayReset = new Date(todayReset); yesterdayReset.setDate(yesterdayReset.getDate()-1);
        const isInToday = (d:string) => { const t=new Date(d).getTime(); return t >= todayReset.getTime(); };
        const isInYesterday = (d:string) => { const t=new Date(d).getTime(); return t >= yesterdayReset.getTime() && t < todayReset.getTime(); };
        const txToday = transactions.filter(t=>isInToday(t.createdAt));
        const txYesterday = transactions.filter(t=>isInYesterday(t.createdAt));
        const ledgerToday = calculateLedger(txToday, userId);
        const ledgerYesterday = calculateLedger(txYesterday, userId);
        // Kategori turunan
        const cat = (ledger:LedgerResult) => {
          // hitung tied up = sisa stok * avgCost
          // rekonstruksi dari itemState via biaya tertahan = totalBought - realised cost
          // sederhana: tied = totalBoughtMoney - (totalSoldMoney - profitNiaga) => modal yang belum terealisasi
          const profitNiaga = ledger.itemBreakdown.reduce((s:any,it:any)=>s+Number(it.profit||0),0);
          const realisedCost = ledger.totalSoldMoney - profitNiaga;
          const tied = Math.max(0, ledger.totalBoughtMoney - realisedCost);
          // deteksi konsumsi/keausan/case dari rows label
          const sumBy = (pred:(r:EnrichedTransaction)=>boolean)=> ledger.rows.filter(pred).reduce((s,r)=>s+Math.abs(Number(r.moneySafe||0)),0);
          const konsumsi = sumBy(r=> /consumption|konsumsi/i.test(r.transactionType));
          const keausan = sumBy(r=> /wear|repair|keausan|perbaikan/i.test(r.transactionType));
          const biayaCase = sumBy(r=> /case/i.test(r.itemCode||'') || /case/i.test(r.transactionType));
          const donasi = sumBy(r=> /donat|tip|donation/i.test(r.transactionType) && r.direction==='expense');
          const lootValue = sumBy(r=> /loot|jarah|reward/i.test(r.transactionType) && r.direction==='income');
          const otherIncome = Math.max(0, ledger.totalIncome - ledger.totalSoldMoney - ledger.totalWageReceived - lootValue);
          const otherExpense = Math.max(0, ledger.totalExpense - ledger.totalWagePaid - konsumsi - keausan - biayaCase - donasi - tied);
          return { profitNiaga, tied, konsumsi, keausan, biayaCase, donasi, lootValue, otherIncome, otherExpense };
        };
        const cToday = cat(ledgerToday);
        const cYesterday = cat(ledgerYesterday);
        const row = (label:string, vToday:number, vYesterday:number, opts?:{sign?:'pos'|'neg'|'auto', bold?:boolean, indent?:boolean, muted?:boolean})=>{
          const fmt=(v:number,sign:'pos'|'neg'|'auto'='auto')=>{
            if (Math.abs(v)<0.005) return '0.00';
            const s = sign==='pos'?'+': sign==='neg'?'-': v>=0?'+':'';
            return s+formatMoney(Math.abs(v));
          };
          const cls=(v:number)=>{
            if (opts?.muted) return 'text-slate-500';
            if (v>0.005) return 'text-emerald-400';
            if (v<-0.005) return 'text-rose-400';
            return 'text-slate-400';
          };
          const vT = label.startsWith('Konsumsi')||label.startsWith('Keausan')||label.startsWith('Biaya')||label.startsWith('Gaji Karyawan')||label.startsWith('Donasi')||label.startsWith('Tertahan')||label.startsWith('Tidak')? -Math.abs(vToday) : vToday;
          const vY = label.startsWith('Konsumsi')||label.startsWith('Keausan')||label.startsWith('Biaya')||label.startsWith('Gaji Karyawan')||label.startsWith('Donasi')||label.startsWith('Tertahan')||label.startsWith('Tidak')? -Math.abs(vYesterday) : vYesterday;
          // income keep +, expense show -
          const isExpense = opts?.sign==='neg' || /Konsumsi|Keausan|Biaya|Gaji Karyawan|Donasi|Tertahan|Tidak/.test(label);
          const showT = isExpense? -Math.abs(vToday) : vToday;
          const showY = isExpense? -Math.abs(vYesterday) : vYesterday;
          return (
            <div className={`grid grid-cols-3 text-[11px] font-mono py-1.5 px-2 ${opts?.bold?'bg-slate-800/50 font-bold':'hover:bg-slate-800/20'} ${opts?.indent?'pl-4':''} border-b border-slate-800/30`}>
              <span className={`truncate ${opts?.bold?'text-slate-200':'text-slate-400'} ${opts?.indent?'':'font-bold uppercase text-[10px] tracking-wider'}`}>{label}</span>
              <span className={`text-right ${cls(showT)}`}>{fmt(showT)}</span>
              <span className={`text-right ${cls(showY)}`}>{fmt(showY)}</span>
            </div>
          );
        };
        const totalPnlToday = (ledgerToday.totalIncome - (ledgerToday.totalExpense - cToday.tied));
        const totalPnlYesterday = (ledgerYesterday.totalIncome - (ledgerYesterday.totalExpense - cYesterday.tied));
        // Gold delta: pakai netWealth today vs yesterday (simpel)
        const goldDeltaToday = ledgerToday.netWealth;
        const goldDeltaYesterday = ledgerYesterday.netWealth;
        return (
          <div className="mb-6 bg-[#0C0D13] border border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-[#07080E] px-2 py-1.5 border-b border-slate-800">
              <span>Kategori</span><span className="text-right">Hari Ini</span><span className="text-right">Kemarin</span>
            </div>
            <div className="bg-emerald-950/10 text-emerald-400 text-[10px] font-black tracking-widest px-2 py-1 border-b border-slate-800">PENDAPATAN</div>
            {row('Penjualan', ledgerToday.totalSoldMoney, ledgerYesterday.totalSoldMoney, {sign:'pos', indent:true})}
            {row('Upah', ledgerToday.totalWageReceived, ledgerYesterday.totalWageReceived, {sign:'pos', indent:true})}
            {row('Nilai Loot', cToday.lootValue, cYesterday.lootValue, {sign:'pos', indent:true})}
            {row('Lain-lain', cToday.otherIncome, cYesterday.otherIncome, {sign:'pos', indent:true})}
            <div className="bg-rose-950/10 text-rose-400 text-[10px] font-black tracking-widest px-2 py-1 border-y border-slate-800">BEBAN</div>
            {row('Konsumsi', cToday.konsumsi, cYesterday.konsumsi, {sign:'neg', indent:true})}
            {row('Keausan/Perbaikan', cToday.keausan, cYesterday.keausan, {sign:'neg', indent:true})}
            {row('Biaya Case', cToday.biayaCase, cYesterday.biayaCase, {sign:'neg', indent:true})}
            {row('Gaji Karyawan', ledgerToday.totalWagePaid, ledgerYesterday.totalWagePaid, {sign:'neg', indent:true})}
            {row('Donasi/Lain-lain', cToday.donasi + cToday.otherExpense, cYesterday.donasi + cYesterday.otherExpense, {sign:'neg', indent:true})}
            {row('Tertahan di Pembelian', cToday.tied, cYesterday.tied, {sign:'neg', indent:true, muted:true})}
            {row('Tidak Terlacak', 0, 0, {sign:'neg', indent:true, muted:true})}
            <div className="bg-slate-800/20 text-slate-300 text-[10px] font-bold px-2 py-1 border-y border-slate-800 flex justify-between"><span>Keberuntungan Case</span><span className="font-mono text-[10px] text-slate-500">—</span></div>
            <div className="grid grid-cols-3 text-xs font-mono font-black py-2 px-2 bg-slate-900/40 border-b border-slate-800">
              <span className="text-slate-200 uppercase text-[11px]">Total P&amp;L</span>
              <span className={`text-right ${totalPnlToday>=0?'text-emerald-400':'text-rose-400'}`}>{totalPnlToday>=0?'+':''}{formatMoney(totalPnlToday)}</span>
              <span className={`text-right ${totalPnlYesterday>=0?'text-emerald-400':'text-rose-400'}`}>{totalPnlYesterday>=0?'+':''}{formatMoney(totalPnlYesterday)}</span>
            </div>
            <div className="grid grid-cols-3 text-xs font-mono font-bold py-2 px-2 bg-emerald-950/10">
              <span className="text-sky-400 uppercase text-[11px]">Delta Gold</span>
              <span className={`text-right ${goldDeltaToday>=0?'text-emerald-400':'text-rose-400'}`}>{goldDeltaToday>=0?'+':''}{formatMoney(goldDeltaToday)}</span>
              <span className={`text-right ${goldDeltaYesterday>=0?'text-emerald-400':'text-rose-400'}`}>{goldDeltaYesterday>=0?'+':''}{formatMoney(goldDeltaYesterday)}</span>
            </div>
            <div className="px-2 py-2 bg-[#07080E] border-t border-slate-800 text-[9px] leading-snug text-slate-500">
              P&amp;L = Pendapatan − Beban (pembelian hanya dihitung saat terkonsumsi). Delta Gold = Gold Live − Start. *Keberuntungan Case = selisih antara nilai loot dan nilai case saat dibuka. Laba/rugi hanya dihitung saat dibuka, profit/loss hanya dihitung saat terjual di market.
            </div>
          </div>
        );
      })()}

      {/* RINGKASAN KEKAYAAN SPLIT - tetap untuk konteks cepat */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="bg-[#0C0D13] p-2.5 rounded-lg border border-emerald-500/15 flex justify-between items-center">
          <div><div className="text-[9px] uppercase font-bold text-slate-500">Total Pemasukan</div><div className="text-xs font-mono font-bold text-emerald-400 flex gap-1">+{formatMoney(totalIncome)} <CurrencyIcon /></div></div><ArrowUpRight className="w-3 h-3 text-emerald-400" />
        </div>
        <div className="bg-[#0C0D13] p-2.5 rounded-lg border border-rose-500/15 flex justify-between items-center">
          <div><div className="text-[9px] uppercase font-bold text-slate-500">Total Pengeluaran</div><div className="text-xs font-mono font-bold text-rose-400 flex gap-1">-{formatMoney(totalExpense)} <CurrencyIcon /></div></div><ArrowDownLeft className="w-3 h-3 text-rose-400" />
        </div>
        <div className="bg-[#0C0D13] p-2.5 rounded-lg border border-slate-700 flex justify-between items-center">
          <div><div className="text-[9px] uppercase font-bold text-slate-500">Kekayaan Bersih</div><div className={`text-xs font-mono font-bold flex gap-1 ${netWealth>=0?'text-emerald-400':'text-rose-400'}`}>{netWealth>=0?'+':''}{formatMoney(netWealth)} <CurrencyIcon /></div></div><Wallet className="w-3 h-3 text-slate-500" />
        </div>
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
              <div className="grid grid-cols-7 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 px-2">
                <span className="col-span-2">Item</span>
                <span className="text-right">Qty Beli</span>
                <span className="text-right">Harga Beli</span>
                <span className="text-right">Qty Jual</span>
                <span className="text-right">Harga Jual</span>
                <span className="text-right">Laba</span>
              </div>
              <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar">
                {itemBreakdown.map((item) => {
                  const configItem = GAME_ITEMS[item.itemCode] || GAME_ITEMS[item.itemCode.toLowerCase()];
                  const displayName = configItem?.name || item.itemCode;
                  return (
                    <div 
                      key={item.itemCode} 
                      className="grid grid-cols-7 text-xs py-2 px-2.5 bg-slate-900/20 border border-slate-800/40 rounded-lg hover:border-slate-700/50 transition duration-150 items-center"
                    >
                      <span className="col-span-2 flex items-center gap-2 min-w-0">
                        <ItemIcon itemCode={item.itemCode} size="sm" />
                        <span className="font-bold text-slate-200 uppercase truncate">{displayName}</span>
                      </span>
                      <span className="text-right text-slate-300 font-mono">
                        {item.totalBoughtQty > 0 ? item.totalBoughtQty.toLocaleString('id-ID') : '—'}
                      </span>
                      <span className="text-right text-amber-500/90 font-mono">
                        {item.totalBoughtQty > 0 ? formatMoney(item.totalBoughtMoney / item.totalBoughtQty) : '—'}
                      </span>
                      <span className="text-right text-slate-300 font-mono">
                        {item.totalSoldQty > 0 ? item.totalSoldQty.toLocaleString('id-ID') : '—'}
                      </span>
                      <span className="text-right text-sky-400/90 font-mono">
                        {item.totalSoldQty > 0 ? formatMoney(item.totalSoldMoney / item.totalSoldQty) : '—'}
                      </span>
                      <span
                        className={`text-right font-mono font-bold ${item.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                        title={item.hasUnknownCost ? 'Harga pokok sebagian tidak diketahui (item dibeli sebelum data dimuat)' : undefined}
                      >
                        {item.profit >= 0 ? '+' : ''}{formatMoney(item.profit)}{item.hasUnknownCost ? '*' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile View Stacked List */}
            <div className="sm:hidden space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {itemBreakdown.map((item) => {
                const configItem = GAME_ITEMS[item.itemCode] || GAME_ITEMS[item.itemCode.toLowerCase()];
                const displayName = configItem?.name || item.itemCode;
                return (
                  <div 
                    key={item.itemCode}
                    className="bg-slate-900/20 border border-slate-800/40 rounded-lg p-3 hover:border-slate-700/50 transition duration-150 text-xs"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <ItemIcon itemCode={item.itemCode} size="sm" />
                        <span className="font-bold text-slate-200 uppercase truncate">{displayName}</span>
                      </span>
                      <span
                        className={`shrink-0 font-mono font-bold ${item.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                        title={item.hasUnknownCost ? 'Harga pokok sebagian tidak diketahui (item dibeli sebelum data dimuat)' : undefined}
                      >
                        {item.profit >= 0 ? '+' : ''}{formatMoney(item.profit)}{item.hasUnknownCost ? '*' : ''}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-1.5">
                        <div className="text-slate-500 font-bold uppercase tracking-wider mb-0.5">Beli</div>
                        <div className="text-amber-400 font-mono font-semibold truncate">
                          {item.totalBoughtQty > 0
                            ? `${item.totalBoughtQty}u × ${formatMoney(item.totalBoughtMoney / item.totalBoughtQty)}`
                            : '—'}
                        </div>
                      </div>
                      <div className="bg-sky-500/5 border border-sky-500/15 rounded-lg p-1.5">
                        <div className="text-slate-500 font-bold uppercase tracking-wider mb-0.5">Jual</div>
                        <div className="text-sky-400 font-mono font-semibold truncate">
                          {item.totalSoldQty > 0
                            ? `${item.totalSoldQty}u × ${formatMoney(item.totalSoldMoney / item.totalSoldQty)}`
                            : '—'}
                        </div>
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
          <div className="flex gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">Beli: <strong className="text-amber-500 inline-flex items-center gap-1">{formatMoney(totalBoughtMoney)} <CurrencyIcon /></strong></span>
            <span className="text-slate-700">|</span>
            <span className="inline-flex items-center gap-1">Jual: <strong className="text-sky-400 inline-flex items-center gap-1">{formatMoney(totalSoldMoney)} <CurrencyIcon /></strong></span>
            <span className="text-slate-700">|</span>
            <span className="inline-flex items-center gap-1">
              Net:
              <strong className={`inline-flex items-center gap-1 ${totalSoldMoney - totalBoughtMoney >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalSoldMoney - totalBoughtMoney >= 0 ? '+' : ''}{formatMoney(totalSoldMoney - totalBoughtMoney)} <CurrencyIcon />
              </strong>
            </span>
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