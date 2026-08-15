import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchWarera } from '../api/apiClient';
import { Swords, RefreshCw, AlertCircle, Shield, Crosshair, Clock, X, ChevronRight } from 'lucide-react';

const INDONESIA_COUNTRY_ID = '6813b6d546e731854c7ac829';
const POLL_BATTLES_MS = 10_000;
const POLL_DETAIL_MS = 5_000;
const POLL_PACTS_MS = 30_000;
const MAX_HITS_PER_SIDE = 12;

let countryMapPromise: Promise<Record<string, string>> | null = null;
let regionMapPromise: Promise<Record<string, string>> | null = null;
const muNameCache = new Map<string, string>();

async function getCountryMap(): Promise<Record<string, string>> {
  if (!countryMapPromise) {
    countryMapPromise = (async () => {
      const res = await fetchWarera('country.getAllCountries', {});
      const items = Array.isArray(res.data) ? res.data : [];
      const map: Record<string, string> = {};
      for (const c of items) {
        if (c?._id && c?.name) map[c._id] = c.name;
      }
      return map;
    })();
  }
  return countryMapPromise;
}

async function getRegionMap(): Promise<Record<string, string>> {
  if (!regionMapPromise) {
    regionMapPromise = (async () => {
      const res = await fetchWarera('region.getAll', {});
      const items = Array.isArray(res.data) ? res.data : [];
      const map: Record<string, string> = {};
      for (const r of items) {
        if (r?._id && r?.code) map[r._id] = r.code;
      }
      return map;
    })();
  }
  return regionMapPromise;
}

function prettifyRegion(code: string): string {
  if (!code) return '—';
  const parts = code.split('-');
  const rest = /^[a-z]{2}$/.test(parts[0] || '') ? parts.slice(1) : parts;
  return rest
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function shortId(id?: string): string {
  if (!id) return '—';
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatNum(n: number | undefined | null): string {
  return (Number(n) || 0).toLocaleString('id-ID');
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Date.now() - t;
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}d`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j`;
  return `${Math.floor(h / 24)}h`;
}

function formatCountdown(targetIso: string | undefined, now: number): string {
  if (!targetIso) return '—';
  const t = new Date(targetIso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = t - now;
  if (diff <= 0) return 'Tick!';
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

interface BattleListItem {
  id: string;
  type: string;
  isActive: boolean;
  region: string;
  attackerName: string;
  defenderName: string;
  attackerCountryId: string;
  defenderCountryId: string;
  attackerDamage: number;
  defenderDamage: number;
  attackerHits: number;
  defenderHits: number;
  attackerWon: number;
  defenderWon: number;
  rounds: number;
  roundsToWin: number;
  hitCount: number;
  updatedAt: string;
  involvesIndonesia: boolean;
}

interface RoundHistory {
  wonBy: string;
  attackerPoints: number;
  defenderPoints: number;
  attackerDamages: number;
  defenderDamages: number;
}

interface LastHit {
  side: 'attacker' | 'defender';
  userId: string;
  mu: string;
  damages: number;
  isCriticalHit: boolean;
  isMissed: boolean;
  hitAt: string;
  weaponCode?: string;
}

interface BattleDetail {
  battleId: string;
  region: string;
  attackerName: string;
  defenderName: string;
  attackerCountryId: string;
  defenderCountryId: string;
  attacker: { damages: number; points: number; hitCount: number; wonRoundsCount: number };
  defender: { damages: number; points: number; hitCount: number; wonRoundsCount: number };
  roundNumber: number;
  isActive: boolean;
  nextTickAt: string | null;
  ticksCount: number;
  actualTickPoints: number;
  roundsToWin: number;
  roundsHistory: RoundHistory[];
  lastHits: LastHit[];
}

interface PactEvent {
  eventId: string;
  type: string;
  countries: string[];
  countryNames: string[];
  createdAt: string;
}

function sideName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export default function LiveBattles() {
  const [battles, setBattles] = useState<BattleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'indonesia'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BattleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pacts, setPacts] = useState<PactEvent[]>([]);
  const [pactsLoading, setPactsLoading] = useState(true);
  const [muNames, setMuNames] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());

  // Timer detik — untuk countdown next tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadBattles = useCallback(async () => {
    try {
      const [battlesRes, countryMap, regionMap] = await Promise.all([
        fetchWarera('battle.getBattles', { isActive: true, limit: 50 }),
        getCountryMap(),
        getRegionMap(),
      ]);

      const items = Array.isArray(battlesRes.data?.items) ? battlesRes.data.items : [];
      const list: BattleListItem[] = items
        .filter((b: any) => b?.attacker && b?.defender)
        .map((b: any) => {
          const attackerCountryId = b.attacker?.country || '';
          const defenderCountryId = b.defender?.country || '';
          return {
            id: b._id || '',
            type: b.type || 'war',
            isActive: b.isActive !== false,
            region: prettifyRegion(regionMap[b.attacker?.region || b.defender?.region || ''] || ''),
            attackerName: countryMap[attackerCountryId] || shortId(attackerCountryId),
            defenderName: countryMap[defenderCountryId] || shortId(defenderCountryId),
            attackerCountryId,
            defenderCountryId,
            attackerDamage: Number(b.attacker?.damages) || 0,
            defenderDamage: Number(b.defender?.damages) || 0,
            attackerHits: Number(b.attacker?.hitCount) || 0,
            defenderHits: Number(b.defender?.hitCount) || 0,
            attackerWon: Number(b.attacker?.wonRoundsCount) || 0,
            defenderWon: Number(b.defender?.wonRoundsCount) || 0,
            rounds: Array.isArray(b.rounds) ? b.rounds.length : 0,
            roundsToWin: Number(b.roundsToWin) || 2,
            hitCount: Number(b.stats?.hitCount) || 0,
            updatedAt: b.updatedAt || b.createdAt || '',
            involvesIndonesia:
              attackerCountryId === INDONESIA_COUNTRY_ID || defenderCountryId === INDONESIA_COUNTRY_ID,
          };
        })
        .sort((a: BattleListItem, b: BattleListItem) => {
          const ta = new Date(a.updatedAt).getTime() || 0;
          const tb = new Date(b.updatedAt).getTime() || 0;
          return tb - ta;
        });

      setBattles(list);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat daftar pertempuran');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [battleRes, countryMap, regionMap] = await Promise.all([
        fetchWarera('battle.getById', { battleId: id }),
        getCountryMap(),
        getRegionMap(),
      ]);

      const b = battleRes.data;
      if (!b) throw new Error('Pertempuran tidak ditemukan');

      const attackerCountryId = b.attacker?.country || '';
      const defenderCountryId = b.defender?.country || '';

      let round: any = null;
      const roundId = b.currentRound || (Array.isArray(b.rounds) ? b.rounds[b.rounds.length - 1] : null);
      if (roundId) {
        const roundRes = await fetchWarera('round.getById', { roundId });
        if (roundRes.success) round = roundRes.data;
      }

      const hits: LastHit[] = [];
      if (round) {
        const pushHits = (arr: any[], side: 'attacker' | 'defender') => {
          (arr || []).slice(0, MAX_HITS_PER_SIDE).forEach((h: any) => {
            hits.push({
              side,
              userId: h?.user || '',
              mu: h?.mu || '',
              damages: Number(h?.damages) || 0,
              isCriticalHit: Boolean(h?.isCriticalHit),
              isMissed: Boolean(h?.isMissed),
              hitAt: h?.hitAt || '',
              weaponCode: h?.weapon?.code || '',
            });
          });
        };
        pushHits(round.attacker?.lastHits, 'attacker');
        pushHits(round.defender?.lastHits, 'defender');
        hits.sort((a, b) => new Date(b.hitAt).getTime() - new Date(a.hitAt).getTime());
      }

      const detail: BattleDetail = {
        battleId: id,
        region: prettifyRegion(regionMap[b.attacker?.region || b.defender?.region || ''] || ''),
        attackerName: countryMap[attackerCountryId] || shortId(attackerCountryId),
        defenderName: countryMap[defenderCountryId] || shortId(defenderCountryId),
        attackerCountryId,
        defenderCountryId,
        attacker: {
          damages: Number(b.attacker?.damages) || 0,
          points: Number(round?.attacker?.points) || 0,
          hitCount: Number(b.attacker?.hitCount) || 0,
          wonRoundsCount: Number(b.attacker?.wonRoundsCount) || 0,
        },
        defender: {
          damages: Number(b.defender?.damages) || 0,
          points: Number(round?.defender?.points) || 0,
          hitCount: Number(b.defender?.hitCount) || 0,
          wonRoundsCount: Number(b.defender?.wonRoundsCount) || 0,
        },
        roundNumber: Number(round?.number) || 0,
        isActive: b.isActive !== false,
        nextTickAt: round?.live?.nextTickAt || null,
        ticksCount: Number(round?.live?.ticksCount) || 0,
        actualTickPoints: Number(round?.live?.actualTickPoints) || 0,
        roundsToWin: Number(b.roundsToWin) || 2,
        roundsHistory: Array.isArray(b.roundsHistory)
          ? b.roundsHistory.map((r: any) => ({
              wonBy: r?.wonBy || '',
              attackerPoints: Number(r?.attackerPoints) || 0,
              defenderPoints: Number(r?.defenderPoints) || 0,
              attackerDamages: Number(r?.attackerDamages) || 0,
              defenderDamages: Number(r?.defenderDamages) || 0,
            }))
          : [],
        lastHits: hits,
      };

      setDetail(detail);
    } catch (e: any) {
      setDetailError(e?.message || 'Gagal memuat detail pertempuran');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadPacts = useCallback(async () => {
    setPactsLoading(true);
    try {
      const res = await fetchWarera('event.getEventsPaginated', {
        countryId: INDONESIA_COUNTRY_ID,
        limit: 100,
      });
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      const countryMap = await getCountryMap();

      const list: PactEvent[] = items
        .filter((e: any) => e?.data?.type === 'defensivePactFormed' || e?.data?.type === 'defensivePactBroken')
        .map((e: any) => {
          const countries: string[] = Array.isArray(e?.data?.countries)
            ? e.data.countries
            : Array.isArray(e?.countries)
              ? e.countries
              : [];
          return {
            eventId: e._id || '',
            type: e.data?.type || '',
            countries,
            countryNames: countries.map((c) => countryMap[c] || shortId(c)),
            createdAt: e.createdAt || '',
          };
        });

      setPacts(list);
    } catch {
      setPacts([]);
    } finally {
      setPactsLoading(false);
    }
  }, []);

  // Muat awal + polling
  useEffect(() => {
    loadBattles();
    loadPacts();
    const battleTimer = setInterval(loadBattles, POLL_BATTLES_MS);
    const pactTimer = setInterval(loadPacts, POLL_PACTS_MS);
    return () => {
      clearInterval(battleTimer);
      clearInterval(pactTimer);
    };
  }, [loadBattles, loadPacts]);

  // Detail saat battle dipilih + polling detail
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    loadDetail(selectedId);
    const timer = setInterval(() => loadDetail(selectedId), POLL_DETAIL_MS);
    return () => clearInterval(timer);
  }, [selectedId, loadDetail]);

  // Resolve nama MU pada last hits secara on-demand
  useEffect(() => {
    const ids = new Set<string>();
    (detail?.lastHits || []).forEach((h) => {
      if (h.mu && !muNameCache.has(h.mu) && !muNames[h.mu]) ids.add(h.mu);
    });
    if (ids.size === 0) return;
    let cancelled = false;
    (async () => {
      await Promise.all(
        Array.from(ids).map(async (muId) => {
          try {
            const res = await fetchWarera('mu.getById', { muId });
            const name = res.data?.name;
            if (name) {
              muNameCache.set(muId, name);
              if (!cancelled) setMuNames((prev) => ({ ...prev, [muId]: name }));
            }
          } catch {
            // biarkan fallback ID pendek
          }
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [detail, muNames]);

  const filteredBattles = useMemo(
    () => (filter === 'indonesia' ? battles.filter((b) => b.involvesIndonesia) : battles),
    [battles, filter],
  );

  const selectedBattle = battles.find((b) => b.id === selectedId) || null;

  return (
    <div className="space-y-5">
      {/* Header + kontrol */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              Pertempuran Aktif
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {loading ? 'memuat…' : `${filteredBattles.length} pertempuran`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-[#0C0D13] border border-slate-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-[11px] font-bold transition duration-150 cursor-pointer ${
                filter === 'all' ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilter('indonesia')}
              className={`px-3 py-1.5 text-[11px] font-bold transition duration-150 cursor-pointer ${
                filter === 'indonesia' ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Indonesia
            </button>
          </div>
          <button
            onClick={() => loadBattles()}
            disabled={loading}
            className="flex items-center gap-1 text-slate-400 hover:text-white text-xs px-2.5 py-1.5 transition duration-150 cursor-pointer disabled:text-slate-600"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="text-xs text-rose-300">{error}</span>
        </div>
      )}

      {/* Detail panel */}
      {selectedBattle && (
        <BattleDetailPanel
          battle={selectedBattle}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          muNames={muNames}
          now={now}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Daftar pertempuran */}
      {loading && battles.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-[#0C0D13] border border-slate-800/60 rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-3 bg-slate-800 rounded w-2/3" />
              <div className="h-2 bg-slate-800/70 rounded w-full" />
              <div className="h-2 bg-slate-800/70 rounded w-4/5" />
            </div>
          ))}
        </div>
      ) : filteredBattles.length === 0 ? (
        <div className="bg-[#0C0D13] border border-dashed border-slate-800 rounded-xl p-8 text-center">
          <Swords className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Tidak ada pertempuran aktif{filter === 'indonesia' ? ' yang melibatkan Indonesia' : ''} saat ini.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredBattles.map((b) => (
            <BattleCard key={b.id} battle={b} selected={b.id === selectedId} onSelect={() => setSelectedId(b.id)} />
          ))}
        </div>
      )}

      {/* Pakta pertahanan */}
      <PactsPanel pacts={pacts} loading={pactsLoading} />
    </div>
  );
}

/* ── Kartu pertempuran ────────────────────────────────────────────── */
function BattleCard({ battle, selected, onSelect }: { battle: BattleListItem; selected: boolean; onSelect: () => void }) {
  const totalDamage = battle.attackerDamage + battle.defenderDamage;
  const attackerPct = totalDamage > 0 ? (battle.attackerDamage / totalDamage) * 100 : 50;
  const attackerLeading = battle.attackerDamage >= battle.defenderDamage;

  return (
    <button
      onClick={onSelect}
      className={`text-left bg-[#0C0D13] border rounded-xl p-3.5 transition duration-150 cursor-pointer hover:bg-[#0F1118] ${
        selected ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-slate-800/60 hover:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {battle.involvesIndonesia && (
            <span className="text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-full px-2 py-0.5 font-bold uppercase tracking-wider shrink-0">
              🇮🇩 ID
            </span>
          )}
          <span className="text-[10px] text-slate-500 font-mono truncate">{battle.region}</span>
        </div>
        <span className="text-[9px] font-mono text-slate-600 shrink-0">R{battle.rounds}</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className={`text-xs font-bold truncate ${attackerLeading ? 'text-sky-300' : 'text-slate-300'}`}>
            {battle.attackerName}
          </span>
        </div>
        <span className="text-[9px] text-slate-500 font-bold shrink-0">⚔️</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-xs font-bold truncate ${!attackerLeading ? 'text-rose-300' : 'text-slate-300'}`}>
            {battle.defenderName}
          </span>
          <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        </div>
      </div>

      {/* Bar damage */}
      <div className="mt-2.5 flex h-1.5 rounded-full overflow-hidden bg-slate-800">
        <div className="bg-sky-500/80 transition-all duration-500" style={{ width: `${attackerPct}%` }} />
        <div className="bg-rose-500/80 transition-all duration-500" style={{ width: `${100 - attackerPct}%` }} />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono">
        <span className="text-sky-400">{formatNum(battle.attackerDamage)}</span>
        <span className="text-slate-600">{formatNum(battle.hitCount)} pukulan</span>
        <span className="text-rose-400">{formatNum(battle.defenderDamage)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500">
        <span>
          {battle.attackerWon}–{battle.defenderWon} ronde (menang {battle.roundsToWin})
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {timeAgo(battle.updatedAt)}
        </span>
      </div>
    </button>
  );
}

/* ── Panel detail ─────────────────────────────────────────────────── */
function BattleDetailPanel({
  battle,
  detail,
  loading,
  error,
  muNames,
  now,
  onClose,
}: {
  battle: BattleListItem;
  detail: BattleDetail | null;
  loading: boolean;
  error: string | null;
  muNames: Record<string, string>;
  now: number;
  onClose: () => void;
}) {
  const totalDamage = (detail?.attacker.damages ?? 0) + (detail?.defender.damages ?? 0);
  const attackerPct = totalDamage > 0 ? ((detail?.attacker.damages ?? 0) / totalDamage) * 100 : 50;

  return (
    <div className="bg-[#0C0D13] border border-emerald-500/20 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-emerald-500/[0.04] border-b border-emerald-500/10">
        <div className="flex items-center gap-2 min-w-0">
          <Swords className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-white truncate">
            {detail?.attackerName || battle.attackerName} ⚔️ {detail?.defenderName || battle.defenderName}
          </span>
          {detail?.region && <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">• {detail.region}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {detail?.nextTickAt && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
              <Clock className="w-3 h-3" />
              Tick {formatCountdown(detail.nextTickAt, now)}
            </span>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition duration-150 cursor-pointer p-1"
            aria-label="Tutup detail"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading && !detail ? (
        <div className="p-5 text-center text-xs text-slate-500 animate-pulse">Memuat detail pertempuran…</div>
      ) : error && !detail ? (
        <div className="p-5 flex items-center gap-2 text-xs text-rose-300">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      ) : detail ? (
        <>
          {/* Poin & damage */}
          <div className="px-4 py-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-sky-500/[0.06] border border-sky-500/15 rounded-lg p-3">
                <div className="text-[9px] text-sky-400 uppercase tracking-wider font-bold mb-1">
                  {detail.attackerName}
                </div>
                <div className="text-lg font-black text-white font-mono leading-none">
                  {formatNum(detail.attacker.points)}
                  <span className="text-[9px] text-slate-500 font-bold ml-1">poin</span>
                </div>
                <div className="mt-1.5 text-[10px] font-mono text-sky-300">
                  {formatNum(detail.attacker.damages)} dmg
                </div>
                <div className="text-[9px] text-slate-500 font-mono">
                  {formatNum(detail.attacker.hitCount)} pukulan • {detail.attacker.wonRoundsCount} ronde
                </div>
              </div>
              <div className="bg-rose-500/[0.06] border border-rose-500/15 rounded-lg p-3">
                <div className="text-[9px] text-rose-400 uppercase tracking-wider font-bold mb-1">
                  {detail.defenderName}
                </div>
                <div className="text-lg font-black text-white font-mono leading-none">
                  {formatNum(detail.defender.points)}
                  <span className="text-[9px] text-slate-500 font-bold ml-1">poin</span>
                </div>
                <div className="mt-1.5 text-[10px] font-mono text-rose-300">
                  {formatNum(detail.defender.damages)} dmg
                </div>
                <div className="text-[9px] text-slate-500 font-mono">
                  {formatNum(detail.defender.hitCount)} pukulan • {detail.defender.wonRoundsCount} ronde
                </div>
              </div>
            </div>

            <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-slate-800">
              <div className="bg-sky-500 transition-all duration-500" style={{ width: `${attackerPct}%` }} />
              <div className="bg-rose-500 transition-all duration-500" style={{ width: `${100 - attackerPct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-slate-500">
              <span className="text-sky-400">⚔️ {formatNum(detail.attacker.damages)}</span>
              <span>
                Ronde {detail.roundNumber} • {detail.roundsToWin} kemenangan untuk menang
              </span>
              <span className="text-rose-400">{formatNum(detail.defender.damages)} 🛡️</span>
            </div>

            {/* Riwayat ronde */}
            {detail.roundsHistory.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {detail.roundsHistory.map((r, i) => (
                  <span
                    key={i}
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-md border ${
                      r.wonBy === 'attacker'
                        ? 'bg-sky-500/10 text-sky-300 border-sky-500/25'
                        : r.wonBy === 'defender'
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                          : 'bg-slate-500/10 text-slate-400 border-slate-500/25'
                    }`}
                  >
                    R{i + 1}: {r.attackerPoints}–{r.defenderPoints} ({r.wonBy || 'berlanjut'})
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Damage feed */}
          <div className="border-t border-slate-800/60 px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Crosshair className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Pukulan Terakhir
              </span>
              <span className="text-[9px] text-slate-600 font-mono">{detail.lastHits.length} pukulan</span>
            </div>

            {detail.lastHits.length === 0 ? (
              <p className="text-[10px] text-slate-600">Belum ada pukulan tercatat di ronde ini.</p>
            ) : (
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-800/30 rounded-lg bg-[#0A0B10] border border-slate-800/40">
                {detail.lastHits.map((h, idx) => (
                  <div key={`${h.hitAt}-${idx}`} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5 text-[9.5px] font-mono">
                    <div className="col-span-2 text-slate-600">
                      {h.hitAt ? new Date(h.hitAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </div>
                    <div className={`col-span-2 font-bold ${h.side === 'attacker' ? 'text-sky-400' : 'text-rose-400'}`}>
                      {h.side === 'attacker' ? '⚔️' : '🛡️'}
                    </div>
                    <div className="col-span-3 truncate text-slate-300">
                      {muNames[h.mu] || shortId(h.mu)}
                    </div>
                    <div className="col-span-3 text-slate-500 truncate">{h.weaponCode || '—'}</div>
                    <div className={`col-span-2 text-right font-bold ${h.isCriticalHit ? 'text-amber-400' : h.isMissed ? 'text-slate-600' : h.side === 'attacker' ? 'text-sky-300' : 'text-rose-300'}`}>
                      {h.isMissed ? 'MISS' : h.isCriticalHit ? `★${formatNum(h.damages)}` : formatNum(h.damages)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Panel pakta pertahanan ───────────────────────────────────────── */
function PactsPanel({ pacts, loading }: { pacts: PactEvent[]; loading: boolean }) {
  return (
    <div className="bg-[#0C0D13] border border-slate-800/60 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pakta Pertahanan Indonesia</span>
        </div>
        <span className="text-[9px] text-slate-600 font-mono">{pacts.length} peristiwa</span>
      </div>

      {loading && pacts.length === 0 ? (
        <p className="text-[10px] text-slate-600 animate-pulse">Memuat pakta…</p>
      ) : pacts.length === 0 ? (
        <p className="text-[10px] text-slate-600">Belum ada peristiwa pakta pertahanan yang tercatat.</p>
      ) : (
        <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/30">
          {pacts.map((p) => (
            <div key={p.eventId} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-slate-300 truncate">
                  {p.type === 'defensivePactFormed' ? (
                    <span className="text-emerald-400">🤝 Pakta terbentuk</span>
                  ) : (
                    <span className="text-rose-400">💔 Pakta berakhir</span>
                  )}
                  <span className="text-slate-500 font-normal"> dengan {p.countryNames.join(', ')}</span>
                </div>
                <div className="text-[9px] text-slate-600 font-mono mt-0.5">
                  {p.createdAt ? new Date(p.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </div>
              </div>
              <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
