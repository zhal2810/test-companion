import React, { useState, useEffect } from 'react';
import { fetchWarera, refreshGameConfig } from '../api/apiClient';
import ApiConfigModal from './ApiConfigModal';
import TransactionLedger from './TransactionLedger';
import CompanyAnalysis, { WealthSummary } from './CompanyAnalysis';
import MarketIntel from './MarketIntel';
import NewsEvents from './NewsEvents';
import TrackingPanel from './TrackingPanel';
import LiveBattles from './LiveBattles';
import CombatUnitOptimizer from './CombatUnitOptimizer';
import Logo from './Logo';
import { Wallet, Building2, TrendingUp, Settings, ChevronRight, FileText, RefreshCw, LogIn, AlertCircle, Newspaper, Radar, Swords, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_TOKEN, DEFAULT_USER_ID, DEFAULT_USERNAME } from '../config/appDefaults';

function formatRangeDate(date: Date): string {
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'transaction' | 'company' | 'market' | 'optimizer' | 'news' | 'tracking' | 'battle'>('company');  const [config, setConfig] = useState<any>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [playerWealth, setPlayerWealth] = useState<any>(null);

  // Fetch wealth sendiri di level Dashboard (bukan ikut CompanyAnalysis),
  // supaya tampil terlepas dari tab mana yang aktif.
  useEffect(() => {
    if (!config?.userId) {
      setPlayerWealth(null);
      return;
    }
    (async () => {
      const res = await fetchWarera('user.getUserById', { userId: config.userId }, config.token);
      // wealth ternyata nested di stats.wealth, BUKAN langsung di root.
      const wealth = res.data?.stats?.wealth;
      if (res.success && wealth) {
        setPlayerWealth(wealth);
      } else {
        console.warn('[Dashboard] stats.wealth tidak ditemukan. Keys di stats:', res.data?.stats ? Object.keys(res.data.stats) : 'stats kosong/null');
      }
    })();
  }, [config?.userId, config?.token]);

  // Sinkronkan data item game config (GAME_ITEMS) dengan API saat config aktif,
  // supaya seluruh tab memakai data terbaru (fallback: snapshot bawaan).
  useEffect(() => {
    if (config?.token) {
      refreshGameConfig(config.token);
    }
  }, [config?.token]);

  // Swipe gesture support for mobile
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [touchEndY, setTouchEndY] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
    setTouchEndX(null);
    setTouchEndY(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
    setTouchEndY(e.targetTouches[0].clientY);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null || touchStartY === null || touchEndY === null) return;
    
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    
    // Swipe hanya di nav, threshold diperberat biar tidak kesenggol pas scroll
    if (Math.abs(diffX) > 90 && Math.abs(diffX) > Math.abs(diffY) * 2) {
      const tabs: ('company' | 'transaction' | 'market' | 'optimizer' | 'news' | 'tracking' | 'battle')[] = ['company', 'transaction', 'market', 'optimizer', 'news', 'tracking', 'battle'];
      const currentIndex = tabs.indexOf(activeTab);
      
      if (diffX > 0) {
        // Swipe left -> next tab
        if (currentIndex < tabs.length - 1) {
          setActiveTab(tabs[currentIndex + 1]);
        }
      } else {
        // Swipe right -> prev tab
        if (currentIndex > 0) {
          setActiveTab(tabs[currentIndex - 1]);
        }
      }
    }
  };

  // Transaction Ledger State
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [perPage, setPerPage] = useState(100);
  const [hasMore, setHasMore] = useState(true);
  // Mingguan: rolling 7 hari mundur dari hari ini + filter jenis transaksi
  const [weekOffset, setWeekOffset] = useState(0);
  const [txTypeFilter, setTxTypeFilter] = useState('all');

  // Load Saved config - support token-only hardcoded
  const loadSavedConfig = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('warera_config') || '{}');
      if (saved.userId && saved.username) {
        // pastikan token ke-sync ke warera_api_token juga
        if (saved.token) localStorage.setItem('warera_api_token', saved.token);
        setConfig(saved);
        return;
      }
      const envToken = (import.meta as any).env?.VITE_WARERA_TOKEN as string | undefined;
      const token = saved.token || localStorage.getItem('warera_api_token') || DEFAULT_TOKEN || envToken || null;
      const username = saved.username || DEFAULT_USERNAME || "";
      const userId = saved.userId || DEFAULT_USER_ID || "";

      // mode token-only: simpan token ke localStorage biar fetchWarera auto pakai
      if (token && !localStorage.getItem('warera_api_token')) {
        localStorage.setItem('warera_api_token', token);
      }

      if (username && userId && token) {
        const autoConfig = {
          username,
          userId,
          token,
          user: saved.user || { username, _id: userId },
        };
        localStorage.setItem('warera_config', JSON.stringify(autoConfig));
        setConfig(autoConfig);
        return;
      }
      // token-only tanpa username/id: tetap null config tapi token sudah ke-store
      // biar komponen yang butuh token tetap jalan via fallback DEFAULT_TOKEN
      setConfig(saved.userId && saved.username ? saved : null);
    } catch (e) {
      setConfig(null);
    }
  };

  useEffect(() => {
    loadSavedConfig();
  }, [isConfigOpen]);

  // Load Transactions on Config / Page changes
  const loadTransactions = async (reset = false) => {
    if (!config?.userId) return;
    setTxLoading(true);

    try {
      // tradingOrder.getPlayerOrderHistory TIDAK ADA di API WarEra (404).
      // Endpoint resmi utk riwayat transaksi/order milik user adalah
      // transaction.getPaginatedTransactions, dengan paginasi berbasis
      // cursor (bukan page number).
      const res = await fetchWarera('transaction.getPaginatedTransactions', {
        userId: config.userId,
        limit: perPage,
        cursor: reset ? undefined : (cursor || undefined),
      }, config.token);

      if (res.success && res.data) {
        const rows = Array.isArray(res.data)
          ? res.data
          : (Array.isArray(res.data.items) ? res.data.items : []);
        const nextCursor = res.data?.nextCursor ?? null;
        const moreAvailable = res.data?.hasMore ?? Boolean(nextCursor);

        if (reset) {
          setTransactions(rows);
        } else {
          setTransactions((prev) => [...prev, ...rows]);
        }
        setCursor(nextCursor);
        setHasMore(moreAvailable);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      setHasMore(false);
    } finally {
      setTxLoading(false);
    }
  };

  useEffect(() => {
    if (config?.userId && activeTab === 'transaction') {
      loadTransactions(true);
    }
  }, [config?.userId, activeTab, perPage]);

  const handleLoadMore = () => {
    (async () => {
      setTxLoading(true);
      try {
        const res = await fetchWarera('transaction.getPaginatedTransactions', {
          userId: config?.userId,
          limit: perPage,
          cursor: cursor || undefined,
        }, config?.token);

        if (res.success && res.data) {
          const rows = Array.isArray(res.data)
            ? res.data
            : (Array.isArray(res.data.items) ? res.data.items : []);
          const nextCursor = res.data?.nextCursor ?? null;
          const moreAvailable = res.data?.hasMore ?? Boolean(nextCursor);

          setTransactions((prev) => [...prev, ...rows]);
          setCursor(nextCursor);
          setHasMore(moreAvailable);
        } else {
          setHasMore(false);
        }
      } catch (e) {
        setHasMore(false);
      } finally {
        setTxLoading(false);
      }
    })();
  };

  // Filter ledger: mingguan (rolling 7 hari) + jenis transaksi
  const ledgerFilter = React.useMemo(() => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - weekOffset * 7);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    const periodLabel = `${formatRangeDate(startDate)} – ${formatRangeDate(endDate)}`;

    const filtered = (transactions as any[]).filter((tx) => {
      const t = new Date(tx.createdAt).getTime();
      if (t >= endDate.getTime() || t < startDate.getTime()) return false;
      if (txTypeFilter === 'all') return true;
      if (txTypeFilter === 'trade') return tx.transactionType === 'trading' || tx.transactionType === 'itemMarket';
      if (txTypeFilter === 'wage') return tx.transactionType === 'wage';
      return tx.transactionType !== 'trading' && tx.transactionType !== 'itemMarket' && tx.transactionType !== 'wage';
    });

    return { filtered, periodLabel };
  }, [transactions, weekOffset, txTypeFilter]);

  return (
    <div className="min-h-screen bg-[#07080D] text-slate-200 font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      
      {/* HEADER BAR */}
      <header className="sticky top-0 z-40 bg-[#090A0E]/95 backdrop-blur-md border-b border-slate-800/80 px-3 md:px-8 py-3.5 flex items-center justify-between gap-2">
        
        {/* LOGO */}
        <div className="flex items-center gap-2 min-w-0">
          <Logo className="w-8 h-8 shrink-0 shadow-lg shadow-emerald-950/20 rounded-lg" />
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white uppercase flex items-center gap-1.5 truncate">
              <span>WarEra <span className="hidden xs:inline">Companion</span></span> 
            </h1>
            <p className="hidden sm:block text-[10px] text-slate-500 font-mono">Market & Rekap Portofolio Makro</p>
          </div>
        </div>

        {/* CONNECTION CARD */}
        <div className="flex items-center gap-2 shrink-0">
          {config ? (
            <button 
              onClick={() => setIsConfigOpen(true)}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg py-1.5 px-2.5 flex items-center gap-2 text-xs transition duration-200 cursor-pointer max-w-[150px] sm:max-w-none"
            >
              {config.user?.avatarUrl ? (
                <img src={config.user.avatarUrl} alt="" className="w-4 h-4 rounded-full border border-emerald-500/20 object-cover shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[9px] font-bold shrink-0">
                  {config.username.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-bold text-white truncate max-w-[65px] sm:max-w-[120px]">{config.username}</span>
              <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          ) : (
            <button 
              onClick={() => setIsConfigOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition duration-200 cursor-pointer shadow-lg shadow-emerald-950/20 shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden xxs:inline">Connect Player</span>
              <span className="inline xxs:hidden">Connect</span>
            </button>
          )}
        </div>

      </header>

      {/* DASHBOARD CORE CONTAINER */}
      <main 
        className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6"
      >

        {/* PROFILE PROMPT FOR DISCONNECTED STATES */}
        {!config && (
          <div className="bg-gradient-to-r from-emerald-950/20 via-slate-950/20 to-slate-950/20 border border-emerald-500/25 rounded-xl p-5 md:p-6 flex items-start gap-4 animate-fade-in shadow-xl">
            <AlertCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                Hubungkan Akun WarEra Anda
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                Dapatkan visualisasi analisis pabrik, laba bersih buruh real-time, sirkulasi uang, dan catatan mutasi buku besar langsung dengan menyambungkan TOken Anda.
              </p>
              <button 
                onClick={() => setIsConfigOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold hover:text-emerald-300 border-b border-emerald-500/20 pb-0.5 mt-2 transition duration-150 cursor-pointer"
              >
                Atur Koneksi Sekarang
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* TAB NAVIGATION - swipe hanya di nav, bukan di konten */}
        <div 
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex border-b border-slate-800/80 gap-1 overflow-x-auto scrollbar-none flex-nowrap touch-pan-y"
        >
          <TabButton 
            active={activeTab === 'company'} 
            onClick={() => setActiveTab('company')}
            label="Pabrik Anda"
            icon={<Building2 className="w-4 h-4" />}
          />
          <TabButton 
            active={activeTab === 'transaction'} 
            onClick={() => setActiveTab('transaction')}
            label="Buku Transaksi"
            icon={<Wallet className="w-4 h-4" />}
          />
          <TabButton 
            active={activeTab === 'market'} 
            onClick={() => setActiveTab('market')}
            label="Bursa Pasar"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <TabButton 
            active={activeTab === 'optimizer'} 
            onClick={() => setActiveTab('optimizer')}
            label="Skill"
            icon={<Target className="w-4 h-4" />}
          />
          <TabButton 
            active={activeTab === 'news'} 
            onClick={() => setActiveTab('news')}
            label="Linimasa"
            icon={<Newspaper className="w-4 h-4" />}
          />
          <TabButton 
            active={activeTab === 'tracking'} 
            onClick={() => setActiveTab('tracking')}
            label="Tracking"
            icon={<Radar className="w-4 h-4" />}
          />
          <TabButton 
            active={activeTab === 'battle'} 
            onClick={() => setActiveTab('battle')}
            label="Pertempuran"
            icon={<Swords className="w-4 h-4" />}
          />
        </div>

        {/* MOBILE SLIDE INDICATOR & SWIPE HINT */}
        <div className="flex sm:hidden flex-col items-center gap-1.5 mt-1">
          <div className="flex justify-center items-center gap-1.5 py-1 px-3 bg-slate-950 border border-slate-900 rounded-full">
            <span className="text-[9px] text-slate-400 font-medium">👈 Geser / Swipe layar untuk ganti tab 👉</span>
          </div>
          <div className="flex justify-center items-center gap-2 mt-0.5">
            <button 
              onClick={() => setActiveTab('company')} 
              className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 'company' ? 'bg-emerald-500 w-5' : 'bg-slate-700 w-1.5'}`}
              aria-label="Pabrik & Buruh"
            />
            <button 
              onClick={() => setActiveTab('transaction')} 
              className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 'transaction' ? 'bg-emerald-500 w-5' : 'bg-slate-700 w-1.5'}`}
              aria-label="Buku Besar Dompet"
            />
            <button 
              onClick={() => setActiveTab('market')} 
              className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 'market' ? 'bg-emerald-500 w-5' : 'bg-slate-700 w-1.5'}`}
              aria-label="Bursa Pasar"
            />
            <button 
              onClick={() => setActiveTab('optimizer')} 
              className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 'optimizer' ? 'bg-emerald-500 w-5' : 'bg-slate-700 w-1.5'}`}
              aria-label="Combat Unit Optimizer"
            />
            <button 
              onClick={() => setActiveTab('news')} 
              className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 'news' ? 'bg-emerald-500 w-5' : 'bg-slate-700 w-1.5'}`}
              aria-label="Berita & Event"
            />
            <button 
              onClick={() => setActiveTab('tracking')} 
              className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 'tracking' ? 'bg-emerald-500 w-5' : 'bg-slate-700 w-1.5'}`}
              aria-label="Tracking Negara"
            />
            <button 
              onClick={() => setActiveTab('battle')} 
              className={`h-1.5 rounded-full transition-all duration-300 ${activeTab === 'battle' ? 'bg-emerald-500 w-5' : 'bg-slate-700 w-1.5'}`}
              aria-label="Pertempuran"
            />
          </div>
        </div>

        {/* TAB VIEWS */}
        <div className="overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="space-y-6"
            >
              {activeTab === 'company' && (
                <CompanyAnalysis 
                  userId={config?.userId} 
                  token={config?.token} 
                />
              )}

              {activeTab === 'transaction' && (
                <div className="space-y-4">

                  {/* Kekayaan Real — data ini publik, tidak butuh token */}
                  <WealthSummary wealth={playerWealth} />

                  {!config?.token ? (
                    <div className="bg-[#12141C] border border-dashed border-slate-800 rounded-xl p-8 text-center">
                      <Wallet className="w-10 h-10 text-slate-600 mx-auto mb-2.5" />
                      <h3 className="text-sm font-bold text-slate-300">Rincian Buku Besar butuh API Token</h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        Riwayat transaksi & mutasi detail cuma bisa diambil dengan API Token
                        (data di atas tetap tampil tanpa token). Buka Settings → buat token
                        di in-game settings WarEra → tempel di sini.
                      </p>
                      <button
                        onClick={() => setIsConfigOpen(true)}
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold hover:text-emerald-300 border-b border-emerald-500/20 pb-0.5 mt-3 transition duration-150 cursor-pointer"
                      >
                        Tambahkan Token Sekarang
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* LEDGER PAGINATION CONTROLS */}
                      {config?.userId && transactions.length > 0 && (
                        <div className="flex justify-between items-center bg-[#0C0D13] p-3 border border-slate-800/60 rounded-xl flex-wrap gap-2">
                          <div className="flex gap-2 items-center">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Periode:</span>
                            <select
                              value={weekOffset}
                              onChange={(e) => setWeekOffset(Number(e.target.value))}
                              className="bg-[#08090C] text-slate-300 border border-slate-800 hover:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer outline-none"
                            >
                              <option value={0}>7 Hari Terakhir</option>
                              <option value={1}>Minggu Lalu (7–14 hr)</option>
                              <option value={2}>2 Minggu Lalu</option>
                              <option value={3}>3 Minggu Lalu</option>
                            </select>
                          </div>

                          <div className="flex gap-2 items-center">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Jenis:</span>
                            <select
                              value={txTypeFilter}
                              onChange={(e) => setTxTypeFilter(e.target.value)}
                              className="bg-[#08090C] text-slate-300 border border-slate-800 hover:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer outline-none"
                            >
                              <option value="all">Semua Tipe</option>
                              <option value="trade">Trading (Beli/Jual)</option>
                              <option value="wage">Gaji</option>
                              <option value="other">Lainnya</option>
                            </select>
                          </div>

                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            {ledgerFilter.periodLabel}
                          </span>

                          <button 
                            onClick={() => loadTransactions(true)}
                            disabled={txLoading}
                            className="flex items-center gap-1 text-slate-400 hover:text-white text-xs px-2.5 py-1.5 transition duration-150 cursor-pointer disabled:text-slate-600"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${txLoading ? 'animate-spin' : ''}`} />
                            Refresh Transaksi
                          </button>
                        </div>
                      )}

                      <TransactionLedger 
                        transactions={ledgerFilter.filtered} 
                        userId={config?.userId} 
                        filterActive={transactions.length > 0}
                      />

                      {/* LOAD MORE */}
                      {config?.userId && transactions.length > 0 && hasMore && (
                        <div className="text-center pt-2">
                          <button
                            onClick={handleLoadMore}
                            disabled={txLoading}
                            className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 text-slate-300 font-semibold px-5 py-2.5 rounded-xl transition duration-200 text-xs cursor-pointer shadow-md"
                          >
                            {txLoading ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                                Mengunduh...
                              </>
                            ) : (
                              'Load More History'
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'market' && (
                <MarketIntel token={config?.token} />
              )}

              {activeTab === 'optimizer' && (
                <CombatUnitOptimizer userId={config?.userId} token={config?.token} />
              )}

              {activeTab === 'news' && (
                <NewsEvents token={config?.token} />
              )}

              {activeTab === 'tracking' && (
                <TrackingPanel token={config?.token} onOpenSettings={() => setIsConfigOpen(true)} />
              )}

              {activeTab === 'battle' && (
                <LiveBattles />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

      </main>

      {/* API CONFIGURATION MODAL */}
      <ApiConfigModal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)} 
      />

    </div>
  );
}

// Subcomponent TabButton
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}

function TabButton({ active, onClick, label, icon }: TabButtonProps) {
  const borderClass = active ? 'border-emerald-500 text-emerald-400 font-bold bg-[#0D1016]' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-800';

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-2.5 sm:py-3 border-b-2 ${borderClass} transition duration-200 text-xs sm:text-sm cursor-pointer shrink-0 uppercase tracking-wider`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}