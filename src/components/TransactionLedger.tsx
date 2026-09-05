import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft, Calendar, FileText, AlertCircle } from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import ItemIcon from './ItemIcon';
import { GAME_ITEMS } from '../data/gameConfig';
import { fetchWarera, getMarketSnapshot } from '../api/apiClient';

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
    // 3. OPEN CASE - bawa item loot (gun, Rare Helmet dll) -> tampilkan nama rarity
    else if (tx.transactionType === 'openCase') {
      const caseCode = tx.itemCode || 'case1';
      const caseName = (GAME_ITEMS[caseCode] || GAME_ITEMS[caseCode.toLowerCase()])?.name || caseCode;
      const lootCode = (tx as any)?.item?.code || (tx as any)?.itemCode || '';
      const lootItem = lootCode ? (GAME_ITEMS[lootCode] || GAME_ITEMS[lootCode.toLowerCase()]) : null;
      const lootName = lootItem?.name || lootCode || 'Unknown';
      enrichedTx.direction = 'neutral';
      enrichedTx.displayLabel = `📦 Buka ${caseName} → 🎁 ${lootName}`;
      // simpan lootCode untuk icon di tabel
      (enrichedTx as any).lootCode = lootCode;
    }
    // 3b. TIPE LAINNYA (Tip, Donasi, dll)
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

  // Counterpart cache untuk pure catatan transaksi (dari/ke siapa) - kayak screenshot JHONTHORZ 42×0.14 → ZXZ
  const [userCache, setUserCache] = useState<Record<string, {username:string, avatarUrl:string}>>({});
  const [muCache, setMuCache] = useState<Record<string, string>>(()=>{ try{ const a=JSON.parse(localStorage.getItem('warera_mu_alias')||'{}'); // bersihkan cache truncated lama MU 69929a biar refetch jadi Komando Lapis Inti
    Object.keys(a).forEach(k=>{ if(typeof a[k]==='string' && a[k].startsWith('MU ') && a[k].length<=10) delete a[k]; }); return a; }catch{ return {}; } });
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  useEffect(()=>{
    getMarketSnapshot().then(res=>{
      if(res.success && res.data){
        const m: Record<string,number> = {};
        const prices = (res.data as any).prices || res.data;
        if(prices && typeof prices==='object'){
          Object.entries(prices).forEach(([k,v]:[string,any])=>{
            const n = typeof v==='number'? v : Number((v as any)?.price ?? (v as any)?.avg ?? 0);
            if(Number.isFinite(n) && n>0) m[k.toLowerCase()] = n;
          });
        }
        if(Object.keys(m).length) setPriceMap(m);
      }
    }).catch(()=>{});
    // fallback via itemTrading.getPrices
    fetchWarera('itemTrading.getPrices', {}).then(res=>{
      if(res.success && res.data){
        const m: Record<string,number> = {};
        Object.entries(res.data as any).forEach(([k,v]:[string,any])=>{
          const n = typeof v==='number'? v : Number((v as any)?.avg ?? (v as any)?.price ?? 0);
          if(Number.isFinite(n) && n>0) m[k.toLowerCase()] = n;
        });
        if(Object.keys(m).length) setPriceMap(prev=> Object.keys(prev).length ? prev : m);
      }
    }).catch(()=>{});
  },[]);
  useEffect(() => {
    const userIds = Array.from(new Set(rows.flatMap(r=>[r.sellerId, r.buyerId]).filter(Boolean) as string[])).filter(id=>id!==userId);
    const muIds = Array.from(new Set(rows.filter(r=>r.transactionType==='donation').flatMap(r=>[(r as any).sellerMuId, (r as any).sellerCountryId]).filter(Boolean) as string[]));
    if (!userIds.length && !muIds.length) return;
    const missingUsers = userIds.filter(id=>!userCache[id]);
    const missingMu = muIds.filter(id=>!muCache[id]);
    if (missingUsers.length) {
      Promise.all(missingUsers.map(async (uid)=>{
        try{
          const res = await fetchWarera('user.getUserById', {userId: uid}, null);
          const u = res.data;
          return [uid, {username: u?.username || uid.slice(0,8), avatarUrl: u?.avatarUrl || ''}] as const;
        }catch{ return [uid, {username: uid.slice(0,8), avatarUrl: ''}] as const; }
      })).then(pairs=>{
        const m: Record<string, {username:string, avatarUrl:string}> = {};
        pairs.forEach(([k,v])=>m[k]=v);
        setUserCache(prev=>({...prev, ...m}));
      });
    }
    if (missingMu.length) {
      Promise.all(missingMu.map(async (mid)=>{
        // cek alias manual dulu
        try{ const aliases = JSON.parse(localStorage.getItem('warera_mu_alias')||'{}'); if(aliases[mid]) return [mid, aliases[mid]] as const; }catch{}
        try{
          // coba MU dulu, fallback country - mu.getById yang benar (bukan militaryUnit)
          let res = await fetchWarera('mu.getById', {muId: mid}, null);
          let name = (res as any)?.data?.name || (res as any)?.data?.title;
          if (!name) {
            res = await fetchWarera('country.getCountryById', {countryId: mid}, null);
            name = (res as any)?.data?.name;
          }
          return [mid, name || `MU ${mid.slice(0,6)}`] as const;
        }catch{ return [mid, `MU ${mid.slice(0,6)}`] as const; }
      })).then(pairs=>{
        const m: Record<string,string> = {};
        pairs.forEach(([k,v])=>m[k]=v);
        setMuCache(prev=>{ const next={...prev, ...m}; localStorage.setItem('warera_mu_alias', JSON.stringify(next)); return next; });
      });
    }
  }, [rows, userId]);

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
        // Kategori turunan - Nilai Loot dari openCase loot × harga pasar (biar tidak 0.00)
        const cat = (ledger:LedgerResult) => {
          const profitNiaga = ledger.itemBreakdown.reduce((s:any,it:any)=>s+Number(it.profit||0),0);
          const realisedCost = ledger.totalSoldMoney - profitNiaga;
          const tied = Math.max(0, ledger.totalBoughtMoney - realisedCost);
          const sumBy = (pred:(r:EnrichedTransaction)=>boolean)=> ledger.rows.filter(pred).reduce((s,r)=>s+Math.abs(Number(r.moneySafe||0)),0);
          const konsumsi = sumBy(r=> /consumption|konsumsi/i.test(r.transactionType));
          const keausan = sumBy(r=> /wear|repair|keausan|perbaikan/i.test(r.transactionType));
          const biayaCase = sumBy(r=> /case/i.test(r.itemCode||'') || /case/i.test(r.transactionType));
          const donasi = sumBy(r=> /donat|tip|donation/i.test(r.transactionType) && r.direction==='expense');
          // Nilai Loot: openCase loot × harga pasar (biar +39 kayak gambar, bukan 0)
          let lootValue = sumBy(r=> /loot|jarah|reward/i.test(r.transactionType) && r.direction==='income');
          if (lootValue < 0.01) {
            const openCases = ledger.rows.filter(r=> r.transactionType==='openCase');
            let sum = 0;
            for(const oc of openCases){
              const code = (oc as any).lootCode || (oc as any)?.item?.code;
              if(!code) continue;
              const p = priceMap[code.toLowerCase()] ?? priceMap[code] ?? 0;
              if(p>0) sum += p;
            }
            if(sum>0) lootValue = sum;
          }
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



      {/* 3. RIWAYAT TRANSAKSI - pure catatan transaksi (tanpa Net Profit, sudah di P&L) + lawan transaksi */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pb-1 border-b border-slate-800/80">
          Semua Mutasi Ledger <span className="normal-case font-normal text-[10px] text-slate-600">— pure catatan, P&L di atas</span>
        </h4>

        {/* Desktop View Table - 3 kol: Waktu | Aktivitas + lawan | Volume */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 px-2">
            <span>Waktu</span>
            <span>Aktivitas (dari/ke)</span>
            <span className="text-right">Volume (cc)</span>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1.5 custom-scrollbar">
            {rows.map((tx) => {
              const isOut = tx.direction === 'buy' || tx.direction === 'expense';
              const isDonation = tx.transactionType === 'donation';
              let counterpartId: string | null = null;
              let counterpartLabel: string | null = null;
              if (isDonation) {
                counterpartId = (tx as any).sellerMuId || (tx as any).sellerCountryId || (tx as any).sellerId || null;
                if (counterpartId) counterpartLabel = muCache[counterpartId] || `MU ${counterpartId.slice(0,6)}...`;
              } else {
                counterpartId = tx.direction === 'sell' ? tx.buyerId! : tx.direction === 'buy' ? tx.sellerId! : tx.direction === 'income' ? (tx as any).buyerId : tx.direction === 'expense' ? (tx as any).sellerId : (tx as any).sellerId || (tx as any).buyerId;
                if (counterpartId && counterpartId !== userId) {
                  const cp = userCache[counterpartId];
                  counterpartLabel = cp ? cp.username : null;
                }
              }
              const isSelf = counterpartId === userId;
              const cp = counterpartId && !isSelf && !isDonation ? userCache[counterpartId] : null;
              const lootExtra = (tx as any).lootCode ? <span className="ml-1 text-[10px] text-slate-500">({(tx as any).lootCode})</span> : null;
              const displayCounterpart = isDonation ? counterpartLabel : (cp ? cp.username : null);
              const showTrunc = !isDonation && counterpartId && !isSelf && !cp;
              return (
                <div
                  key={tx._id}
                  className="grid grid-cols-3 text-xs py-2 px-2.5 border border-transparent hover:border-slate-800 hover:bg-slate-900/10 rounded-lg transition duration-150 items-center"
                >
                  <span className="text-slate-500 text-[10.5px] font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-600" />
                    {formatDate(tx.createdAt)}
                  </span>

                    <span className={`font-medium truncate flex items-center gap-1.5 ${isOut ? 'text-amber-500/95' : 'text-sky-400/95'}`}>
                    <span className="truncate">{tx.displayLabel} {tx.quantity ? <span className="text-slate-600 font-mono">({tx.quantity}u)</span> : ''}{lootExtra}</span>
                    {displayCounterpart && <span className="hidden lg:inline-flex items-center gap-1 text-[10px] text-slate-500 shrink-0">→ {cp?.avatarUrl && <img src={cp.avatarUrl} alt="" className="w-3.5 h-3.5 rounded-full" />}{displayCounterpart}</span>}
                    {showTrunc && <span className="hidden lg:inline text-[10px] text-slate-600">→ {counterpartId!.slice(0,6)}...</span>}
                  </span>

                  <span className="text-right text-slate-200 font-mono font-medium flex items-center justify-end gap-1">
                    {formatMoney(tx.moneySafe)} <CurrencyIcon />
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile View Stacked List */}
        <div className="sm:hidden space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
          {rows.map((tx) => {
            const isOut = tx.direction === 'buy' || tx.direction === 'expense';
            const isDonation = tx.transactionType === 'donation';
            let counterpartId: string | null = null;
            let counterpartLabel: string | null = null;
            if (isDonation) {
              counterpartId = (tx as any).sellerMuId || (tx as any).sellerCountryId || (tx as any).sellerId || null;
              if (counterpartId) counterpartLabel = muCache[counterpartId] || `MU ${counterpartId.slice(0,6)}...`;
            } else {
              counterpartId = tx.direction === 'sell' ? tx.buyerId! : tx.direction === 'buy' ? tx.sellerId! : tx.direction === 'income' ? (tx as any).buyerId : tx.direction === 'expense' ? (tx as any).sellerId : (tx as any).sellerId || (tx as any).buyerId;
              if (counterpartId && counterpartId !== userId) {
                const cp2 = userCache[counterpartId];
                counterpartLabel = cp2 ? cp2.username : null;
              }
            }
            const isSelf = counterpartId === userId;
            const cp = counterpartId && !isSelf && !isDonation ? userCache[counterpartId] : null;
            return (
              <div
                key={tx._id}
                className="bg-slate-900/10 hover:bg-slate-900/20 border border-slate-800/40 hover:border-slate-700/40 p-3 rounded-lg transition duration-150 flex justify-between items-center text-xs"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <span className={`font-bold block truncate ${isOut ? 'text-amber-500/95' : 'text-sky-400/95'}`}>
                    {tx.displayLabel} {tx.quantity ? <span className="text-slate-500 font-mono text-[10px]">({tx.quantity}u)</span> : ''}
                  </span>
                  <span className="text-slate-500 text-[10px] font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-600 shrink-0" />
                    {formatDate(tx.createdAt)}
                  </span>
                  {counterpartLabel && <span className="flex items-center gap-1 text-[10px] text-slate-500">→ {cp?.avatarUrl && <img src={cp.avatarUrl} alt="" className="w-3 h-3 rounded-full" />}{counterpartLabel}</span>}
                  {!counterpartLabel && counterpartId && isSelf && <span className="text-[10px] text-slate-600">→ (diri sendiri)</span>}
                </div>
                
                <div className="text-right shrink-0 ml-3">
                  <span className="text-slate-200 font-mono font-medium flex items-center justify-end gap-1">
                    {formatMoney(tx.moneySafe)} <CurrencyIcon />
                  </span>
                  <span className="text-[10px] text-slate-600">—</span>
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