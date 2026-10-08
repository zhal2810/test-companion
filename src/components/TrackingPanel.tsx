import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  RefreshCw,
  TrendingUp,
  Wallet,
  Package,
  History,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Radar,
  Coins,
  HandCoins,
} from 'lucide-react';
import CurrencyIcon from './CurrencyIcon';
import ItemIcon from './ItemIcon';
import DonationIcon from './DonationIcon';
import { fetchWarera } from '../api/apiClient';
import { getCached, setCache } from '../utils/trackerCache';

interface TrackerProps {
  token?: string | null;
  onOpenSettings?: () => void;
}

const DEFAULT_COUNTRY_ID = '6813b6d546e731854c7ac829'; // Indonesia
const COUNTRY_STORAGE_KEY = 'tracker_country_id';
const TRUNCATED_ID_RE = /^[0-9a-f]{8}$/i;

// ─── Util minggu: Senin 00:00 UTC (= Senin 07:00 WIB, yang ditulis di label)
function mondayOf(input: string | Date): string {
  const d = new Date(input);
  const diff = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
    .toISOString()
    .slice(0, 10);
}

function shiftWeek(weekStart: string, delta: number): string {
  const d = new Date(`${weekStart}T00:00:00.000Z`).getTime() + delta * 7 * 86400000;
  return new Date(d).toISOString().slice(0, 10);
}

const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAY_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function fmtWIB(utcIso: string): string {
  const d = new Date(utcIso);
  const wib = new Date(d.getTime() + 7 * 3600000);
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  return `${DAY_ID[wib.getUTCDay()]}, ${wib.getUTCDate()} ${MONTH_ID[wib.getUTCMonth()]} ${hh}:00`;
}

function weekLabel(weekStart: string): string {
  const s = new Date(`${weekStart}T00:00:00.000Z`);
  const e = new Date(s.getTime() + 7 * 86400000);
  return `${fmtWIB(s.toISOString())} – ${fmtWIB(e.toISOString())} WIB`;
}

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

function formatDate(dateString: string | null): string {
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
  return itemCode || '—';
}

// ─── Tipe data ───
interface DonationDay {
  date: string;
  total: number;
  count: number;
}
interface TopDonor {
  userId: string;
  username: string;
  avatarUrl: string;
  total: number;
  count: number;
  lastAt: string;
}
interface DonationEvent {
  donorId: string;
  donorName: string;
  donorAvatar: string;
  money: number;
  at: string;
}
interface DonationData {
  weekStart: string;
  fetchedAt: string;
  pagesUsed: number;
  week: { total: number; count: number; donors: number; daily: DonationDay[] };
  month: { month: string; total: number; count: number };
  topDonors: TopDonor[];
  recent: DonationEvent[];
}

interface TopSeller {
  sellerId: string;
  name: string;
  avatarUrl: string;
  tx: number;
  volume: number;
  tax: number;
}
interface TaxSale {
  txId: string;
  itemCode: string;
  money: number;
  tax: number;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string;
  soldAt: string;
}
interface TaxData {
  rate: number;
  citizenCount: number;
  citizenStale: boolean;
  aggregate: { totalTax: number; totalVolume: number; txCount: number; sellerCount: number; updatedAt: string | null };
  topSellers: TopSeller[];
  recent: TaxSale[];
  ingest: { done: boolean; nextCursor: string | null; scanned: number; newRows: number; oldestSeen: string | null };
  weeks: { weekStart: string; totalTax: number; txCount: number }[];
  fetchedAt: string;
}

const MAX_POLLS = 80;

// Avatar bulat + fallback inisial bila tidak ada/gagal load.
function Avatar({ url, name }: { url?: string; name: string }) {
  const [err, setErr] = useState(false);
  if (url && !err) {
    return (
      <img
        src={url}
        alt={name}
        loading="lazy"
        onError={() => setErr(true)}
        className="w-5 h-5 rounded-full object-cover shrink-0 bg-slate-800"
      />
    );
  }
  return (
    <span className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center text-[9px] font-bold shrink-0">
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function TrackingPanel({ token }: TrackerProps) {
  const [countryId, setCountryId] = useState(
    () => localStorage.getItem(COUNTRY_STORAGE_KEY) || DEFAULT_COUNTRY_ID,
  );
  const [countries, setCountries] = useState<{ _id: string; name: string }[]>([]);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const isCurrentWeek = weekStart === mondayOf(new Date());

  // Donasi
  const [donation, setDonation] = useState<DonationData | null>(null);
  const [donLoading, setDonLoading] = useState(true);
  const [donError, setDonError] = useState<string | null>(null);
  const [donorSearch, setDonorSearch] = useState('');

  // Pajak market
  const [tax, setTax] = useState<TaxData | null>(null);
  const [taxLoading, setTaxLoading] = useState(true);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef(0);

  useEffect(() => {
    localStorage.setItem(COUNTRY_STORAGE_KEY, countryId);
  }, [countryId]);

  // Daftar negara (cache 30 menit)
  useEffect(() => {
    const cached = getCached<{ _id: string; name: string }[]>('countries', 30 * 60 * 1000);
    if (cached) {
      setCountries(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWarera('country.getAllCountries', {}, token ?? null);
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];
        if (!cancelled && list.length > 0) {
          const mapped = list
            .map((c: any) => ({ _id: c._id || c.id, name: c.name || c.code || '' }))
            .filter((c) => c._id);
          setCountries(mapped);
          setCache('countries', mapped, 30 * 60 * 1000);
        }
      } catch {
        // abaikan — selector disembunyikan bila kosong
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ─── Load donasi ───
  const loadDonations = useCallback(
    async (force = false) => {
      setDonLoading(true);
      setDonError(null);
      try {
        const params = new URLSearchParams({ countryId, weekStart });
        if (force) params.set('_', String(Date.now()));
        const res = await fetch(`/api/tracker/donations?${params.toString()}`);
        const json = await res.json();
        if (!json.success || !json.data) throw new Error(json.error || 'Gagal memuat donasi');
        setDonation(json.data);
      } catch (err: any) {
        setDonError(err.message || 'Terjadi kesalahan');
      } finally {
        setDonLoading(false);
      }
    },
    [countryId, weekStart],
  );

  useEffect(() => {
    loadDonations();
  }, [loadDonations]);

  // ─── Load pajak market + poll ingest sampai done ───
  const fetchTaxPage = useCallback(
    async (cursor: string | null, week: string, cid: string) => {
      const params = new URLSearchParams({ countryId: cid, weekStart: week, pages: '25' });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/tracker/market-tax?${params.toString()}`);
      const json = await res.json();
      if (!json.success || !json.data) throw new Error(json.error || 'Gagal memuat pajak market');
      return json.data as TaxData;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    pollRef.current += 1;
    const runId = pollRef.current;
    setTaxLoading(true);
    setTaxError(null);
    setPollCount(0);
    (async () => {
      try {
        let cursor: string | null = null;
        let rounds = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (cancelled || pollRef.current !== runId) return;
          const data = await fetchTaxPage(cursor, weekStart, countryId);
          if (cancelled || pollRef.current !== runId) return;
          setTax(data);
          setTaxLoading(false);
          rounds++;
          setPollCount(rounds);
          if (data.ingest.done || !data.ingest.nextCursor || rounds >= MAX_POLLS) {
            setIngesting(false);
            return;
          }
          setIngesting(true);
          cursor = data.ingest.nextCursor;
        }
      } catch (err: any) {
        if (!cancelled && pollRef.current === runId) {
          setTaxError(err.message || 'Terjadi kesalahan');
          setTaxLoading(false);
          setIngesting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [countryId, weekStart, fetchTaxPage]);

  // Resolve username + avatar on-demand untuk baris yang namanya belum ada.
  const [usernameCache, setUsernameCache] = useState<Record<string, string>>({});
  const [avatarCache, setAvatarCache] = useState<Record<string, string>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set<string>();
    const consider = (id: string, name: string, avatar: string) => {
      if (!id) return;
      const needName = !name || TRUNCATED_ID_RE.test(name);
      const needAvatar = !avatar;
      if ((!needName || usernameCache[id]) && (!needAvatar || avatarCache[id])) return;
      if (needName && !usernameCache[id] && pendingRef.current.has(id)) return;
      if (!needName && needAvatar && !avatarCache[id] && pendingRef.current.has(id)) return;
      ids.add(id);
    };
    for (const d of donation?.topDonors || []) consider(d.userId, d.username, d.avatarUrl);
    for (const e of donation?.recent || []) consider(e.donorId, e.donorName, e.donorAvatar);
    for (const s of tax?.topSellers || []) consider(s.sellerId, s.name, s.avatarUrl);
    for (const t of tax?.recent || []) consider(t.sellerId, t.sellerName, t.sellerAvatar);
    if (ids.size === 0) return;
    ids.forEach((id) => pendingRef.current.add(id));
    (async () => {
      await Promise.all(
        Array.from(ids).map(async (id) => {
          try {
            const res = await fetch(`/api/players/user.getUserById?userId=${encodeURIComponent(id)}`);
            const json = await res.json();
            const user = json?.result?.data;
            if (user?.username) setUsernameCache((prev) => ({ ...prev, [id]: user.username }));
            if (user?.avatarUrl) setAvatarCache((prev) => ({ ...prev, [id]: user.avatarUrl }));
          } catch {
            // fallback ID pendek + inisial
          } finally {
            pendingRef.current.delete(id);
          }
        }),
      );
    })();
  }, [donation, tax, usernameCache, avatarCache]);

  const donorName = useCallback(
    (id: string, fallback: string): string => {
      if (fallback && !TRUNCATED_ID_RE.test(fallback)) return fallback;
      return usernameCache[id] || (id ? id.slice(0, 8) : '—');
    },
    [usernameCache],
  );

  const avatarFor = useCallback(
    (id: string, fallback: string): string => avatarCache[id] || fallback || '',
    [avatarCache],
  );

  const filteredTopDonors = useMemo(() => {
    const q = donorSearch.trim().toLowerCase();
    const list = donation?.topDonors || [];
    if (!q) return list;
    return list.filter((d) => donorName(d.userId, d.username).toLowerCase().includes(q));
  }, [donation, donorSearch, donorName]);

  const refreshAll = () => {
    loadDonations(true);
    pollRef.current += 1; // hentikan poll lama
    setTax(null);
    setTaxLoading(true);
    setTaxError(null);
    pollRef.current += 1;
    const runId = pollRef.current;
    (async () => {
      try {
        let cursor: string | null = null;
        let rounds = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (pollRef.current !== runId) return;
          const data = await fetchTaxPage(cursor, weekStart, countryId);
          if (pollRef.current !== runId) return;
          setTax(data);
          setTaxLoading(false);
          rounds++;
          setPollCount(rounds);
          if (data.ingest.done || !data.ingest.nextCursor || rounds >= MAX_POLLS) {
            setIngesting(false);
            return;
          }
          setIngesting(true);
          cursor = data.ingest.nextCursor;
        }
      } catch (err: any) {
        if (pollRef.current === runId) {
          setTaxError(err.message || 'Terjadi kesalahan');
          setTaxLoading(false);
          setIngesting(false);
        }
      }
    })();
  };

  return (
    <div className="space-y-4">
      {/* HEADER: negara + navigator minggu + refresh */}
      <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tracking Negara</span>
          </div>
          <div className="flex items-center gap-2">
            {countries.length > 0 && (
              <select
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                className="bg-[#0C0D13] border border-slate-800 hover:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-300 outline-none focus:border-sky-500/50 cursor-pointer"
              >
                {countries
                  .slice()
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
            <button
              onClick={refreshAll}
              disabled={donLoading}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition duration-150 cursor-pointer disabled:text-slate-600 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${donLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Navigator minggu Senin–Senin */}
        <div className="flex items-center justify-between gap-2 bg-[#08090C] border border-slate-800 rounded-xl px-2 py-1.5">
          <button
            onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
            aria-label="Minggu sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-0">
            <div className="text-xs font-bold text-slate-200 truncate">{weekLabel(weekStart)}</div>
            {!isCurrentWeek && (
              <button
                onClick={() => setWeekStart(mondayOf(new Date()))}
                className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold transition cursor-pointer"
              >
                ← Kembali ke minggu ini
              </button>
            )}
          </div>
          <button
            onClick={() => !isCurrentWeek && setWeekStart((w) => shiftWeek(w, 1))}
            disabled={isCurrentWeek}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Minggu berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ══════════ SECTION: DONASI MINGGUAN ══════════ */}
      <div className="bg-[#0C0D13] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <DonationIcon className="w-3.5 h-3.5 text-amber-400" /> Donasi Mingguan
          </h3>
          <span className="text-[10px] text-slate-500">
            {donation ? `${formatFullMoney(donation.week.total)} minggu ini · ${formatFullMoney(donation.month.total)} bulan ini` : '…'}
          </span>
        </div>

        {donLoading && (
          <div className="p-8 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-sky-500" />
            <span className="text-xs text-slate-400">Memuat donasi…</span>
          </div>
        )}
        {donError && (
          <div className="m-3 bg-rose-950/20 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-400">Gagal memuat donasi</h4>
              <p className="text-xs text-rose-300/70 mt-1">{donError}</p>
            </div>
          </div>
        )}

        {!donLoading && !donError && donation && (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> Total
                </div>
                <div className="text-lg font-black font-mono text-slate-100 flex items-center gap-1 mt-1">
                  {formatMoney(donation.week.total)} <CurrencyIcon className="w-3.5 h-3.5" />
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">minggu ini</div>
              </div>
              <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <History className="w-3 h-3" /> Donasi
                </div>
                <div className="text-lg font-black font-mono text-slate-100 mt-1">
                  {donation.week.count.toLocaleString('id-ID')}×
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">pemberian</div>
              </div>
              <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <HandCoins className="w-3 h-3" /> Donatur
                </div>
                <div className="text-lg font-black font-mono text-slate-100 mt-1">
                  {donation.week.donors.toLocaleString('id-ID')}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">unik minggu ini</div>
              </div>
              <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Bulan Ini
                </div>
                <div className="text-lg font-black font-mono text-slate-100 flex items-center gap-1 mt-1">
                  {formatMoney(donation.month.total)} <CurrencyIcon className="w-3.5 h-3.5" />
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{donation.month.month}</div>
              </div>
            </div>

            {/* Grafik harian dihapus — dibedakan dari spywarera */}

            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={donorSearch}
                onChange={(e) => setDonorSearch(e.target.value)}
                placeholder="Cari donatur…"
                className="w-full bg-[#08090C] border border-slate-800 focus:border-sky-500/50 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600"
              />
            </div>

            {filteredTopDonors.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Belum ada donasi minggu ini.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-slate-800/60">
                <table className="w-full text-left text-xs min-w-[520px]">
                  <thead className="sticky top-0 bg-[#12141C]">
                    <tr className="text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
                      <th className="px-3 py-2 font-bold">Top Donatur</th>
                      <th className="px-3 py-2 font-bold text-right">Donasi</th>
                      <th className="px-3 py-2 font-bold text-right">Total</th>
                      <th className="px-3 py-2 font-bold text-right">Terakhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTopDonors.map((d) => (
                      <tr key={d.userId} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                        <td className="px-3 py-2 font-semibold text-slate-200">
                          <div className="flex items-center gap-2">
                            <Avatar url={avatarFor(d.userId, d.avatarUrl)} name={donorName(d.userId, d.username)} />
                            <span>{donorName(d.userId, d.username)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{d.count}×</td>
                        <td className="px-3 py-2 text-right font-mono text-amber-300">
                          {formatFullMoney(d.total)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-400">{formatDate(d.lastAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════ SECTION: PAJAK MARKET (1%) ══════════ */}
      <div className="bg-[#0C0D13] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-emerald-400" /> Pajak Market ({tax?.rate ?? 1}%)
          </h3>
          <span className="text-[10px] text-slate-500">
            {tax ? `${tax.aggregate.txCount.toLocaleString('id-ID')} penjualan` : '…'}
          </span>
        </div>

        {taxLoading && (
          <div className="p-8 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-sky-500" />
            <span className="text-xs text-slate-400">Mengumpulkan data pajak…</span>
          </div>
        )}
        {taxError && (
          <div className="m-3 bg-rose-950/20 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-400">Gagal memuat pajak market</h4>
              <p className="text-xs text-rose-300/70 mt-1">{taxError}</p>
            </div>
          </div>
        )}

        {!taxLoading && !taxError && tax && (
          <div className="p-3 space-y-3">
            {ingesting && (
              <div className="bg-[#12141C] border border-sky-500/20 rounded-xl p-3">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-sky-300 font-semibold flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Mengumpulkan transaksi…
                  </span>
                  <span className="text-slate-500 font-mono">
                    {tax.ingest.oldestSeen ? `sampai ${formatDate(tax.ingest.oldestSeen)}` : ''} · {pollCount} batch
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            )}
            {tax.citizenStale && (
              <div className="text-[10px] text-amber-400/80">
                Daftar citizen mungkin basi (spywarera tidak dapat dihubungi) — angka memakai snapshot terakhir.
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> Pajak Masuk
                </div>
                <div className="text-lg font-black font-mono text-emerald-400 flex items-center gap-1 mt-1">
                  {formatMoney(tax.aggregate.totalTax)} <CurrencyIcon className="w-3.5 h-3.5" />
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">1% kas negara</div>
              </div>
              <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Volume
                </div>
                <div className="text-lg font-black font-mono text-slate-100 flex items-center gap-1 mt-1">
                  {formatMoney(tax.aggregate.totalVolume)} <CurrencyIcon className="w-3.5 h-3.5" />
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">nilai penjualan</div>
              </div>
              <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Package className="w-3 h-3" /> Transaksi
                </div>
                <div className="text-lg font-black font-mono text-slate-100 mt-1">
                  {tax.aggregate.txCount.toLocaleString('id-ID')}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">penjualan gear</div>
              </div>
              <div className="bg-[#12141C] border border-slate-800 rounded-2xl p-3">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Radar className="w-3 h-3" /> Penjual
                </div>
                <div className="text-lg font-black font-mono text-slate-100 mt-1">
                  {tax.aggregate.sellerCount.toLocaleString('id-ID')}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">dari {tax.citizenCount} citizen</div>
              </div>
            </div>

            {tax.topSellers.length > 0 && (
              <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-slate-800/60">
                <table className="w-full text-left text-xs min-w-[480px]">
                  <thead className="sticky top-0 bg-[#12141C]">
                    <tr className="text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
                      <th className="px-3 py-2 font-bold">Top Seller</th>
                      <th className="px-3 py-2 font-bold text-right">Tx</th>
                      <th className="px-3 py-2 font-bold text-right">Volume</th>
                      <th className="px-3 py-2 font-bold text-right">Pajak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tax.topSellers.map((s) => (
                      <tr key={s.sellerId} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                        <td className="px-3 py-2 font-semibold text-slate-200">
                          <div className="flex items-center gap-2">
                            <Avatar url={avatarFor(s.sellerId, s.avatarUrl)} name={s.name} />
                            <span>{s.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{s.tx}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{formatFullMoney(s.volume)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                          +{formatFullMoney(s.tax)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tax.recent.length > 0 && (
              <div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <History className="w-3 h-3" /> Penjualan kena pajak terbaru
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-slate-800/60">
                  <table className="w-full text-left text-xs min-w-[560px]">
                    <thead className="sticky top-0 bg-[#12141C]">
                      <tr className="text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
                        <th className="px-3 py-2 font-bold">Waktu</th>
                        <th className="px-3 py-2 font-bold">Item</th>
                        <th className="px-3 py-2 font-bold">Seller</th>
                        <th className="px-3 py-2 font-bold text-right">Laku</th>
                        <th className="px-3 py-2 font-bold text-right">Pajak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tax.recent.map((t) => (
                        <tr key={t.txId} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatDate(t.soldAt)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                                <ItemIcon itemCode={t.itemCode} size="sm" className="w-full h-full object-contain" />
                              </div>
                              <span className="font-semibold text-slate-200">{getItemName(t.itemCode)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            <div className="flex items-center gap-2">
                              <Avatar url={avatarFor(t.sellerId, t.sellerAvatar)} name={t.sellerName} />
                              <span>{t.sellerName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-300">{formatFullMoney(t.money)}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                            +{formatFullMoney(t.tax)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tax.weeks.length > 0 && (
              <div>
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Arsip minggu
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tax.weeks.map((w) => (
                    <button
                      key={w.weekStart}
                      onClick={() => setWeekStart(w.weekStart)}
                      className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                        w.weekStart === weekStart
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-[#12141C] text-slate-400 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {w.weekStart.slice(8, 10)}/{(Number(w.weekStart.slice(5, 7)))} · {formatMoney(w.totalTax)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
