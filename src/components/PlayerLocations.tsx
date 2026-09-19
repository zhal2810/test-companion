import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWarera } from '../api/apiClient';
import { MapPin, RefreshCw, AlertCircle, Users, Search, Loader } from 'lucide-react';

// Tab Lokasi — ketik nama Military Unit (MU), lalu lihat daftar anggota
// beserta lokasi mereka (negara/region/lokasi) yang di-resolve via
// user.getUserById + country.getAllCountries + region.getAll.
// Pencarian MU memakai search.searchAnything (mengembalikan muIds).

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '';
  const c = code.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + c.charCodeAt(0) - 65,
    0x1f1e6 + c.charCodeAt(1) - 65,
  );
}

function CountryFlagPng({ code, className = 'w-4.5 h-3.5 object-cover rounded shadow-sm border border-slate-800/40 inline-block align-middle mr-1.5' }: { code?: string; className?: string }) {
  const [error, setError] = React.useState(false);
  const clean = code?.toLowerCase() || '';
  const url = clean.length === 2 ? `https://flagcdn.com/w40/${clean}.png` : '';

  React.useEffect(() => {
    setError(!url);
  }, [url]);

  if (error || !url) {
    const emoji = flagEmoji(clean);
    return <span className="inline-block align-middle leading-none mr-1.5">{emoji || ''}</span>;
  }

  return <img src={url} alt={clean} className={className} onError={() => setError(true)} referrerPolicy="no-referrer" />;
}

interface MuSummary {
  _id: string;
  name: string;
  region?: string;
  country?: string;
  members?: string[];
}

interface MemberLocation {
  userId: string;
  username: string;
  level: number;
  avatarUrl?: string;
  countryId?: string;
  regionId?: string;
  locationId?: string;
  skills?: Record<string, { level?: number }>;
  buffs?: { debuffCodes?: string[]; debuffEndAt?: string; buffCodes?: string[]; buffEndAt?: string };
}

interface PlayerLocationsProps {
  token?: string | null;
}

const RESOLVE_CONCURRENCY = 5;

type SortKey = 'player' | 'lv' | 'build' | 'buffs' | 'negara' | 'home' | 'lokasi' | null;

const WAR_KEYS = ['attack', 'precision', 'criticalChance', 'criticalDamages', 'armor', 'dodge', 'health', 'hunger', 'lootChance'];
const ECO_KEYS = ['entrepreneurship', 'energy', 'production', 'companies', 'management'];

function skillCost(l = 0) {
  return (Math.max(0, Math.round(l)) * (Math.max(0, Math.round(l)) + 1)) / 2;
}

function buildWarEco(m: MemberLocation) {
  const ps = m.skills ?? {};
  const war = WAR_KEYS.reduce((s, k) => s + skillCost(ps[k]?.level), 0);
  const eco = ECO_KEYS.reduce((s, k) => s + skillCost(ps[k]?.level), 0);
  return { war, eco, pct: war + eco > 0 ? Math.round((war / (war + eco)) * 100) : 50 };
}

function buffEndTime(b: MemberLocation['buffs']) {
  if (!b) return 0;
  const debuff = b.debuffEndAt ? new Date(b.debuffEndAt).getTime() : 0;
  const buff = b.buffEndAt ? new Date(b.buffEndAt).getTime() : 0;
  return Math.max(debuff, buff);
}

export default function PlayerLocations({ token }: PlayerLocationsProps) {
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<MuSummary[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [selectedMuId, setSelectedMuId] = useState('');
  const [selectedMuName, setSelectedMuName] = useState('');
  const [members, setMembers] = useState<MemberLocation[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: Exclude<SortKey, null>) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'player' ? 'asc' : 'desc');
    }
  };

  const countryMapRef = useRef<Record<string, { name: string; code: string }>>({});
  const regionMapRef = useRef<Record<string, { name: string; countryCode: string }>>({});
  const muCacheRef = useRef<Record<string, MuSummary>>({});
  const searchTimerRef = useRef<number | null>(null);

  // Satu kali muat: map negara + map region
  useEffect(() => {
    let mounted = true;

    (async () => {
      const [countryRes, regionRes] = await Promise.all([
        fetchWarera('country.getAllCountries', {}, token),
        fetchWarera('region.getAll', {}, token),
      ]);

      if (!mounted) return;

      if (countryRes.success && Array.isArray(countryRes.data)) {
        const map: Record<string, { name: string; code: string }> = {};
        for (const c of countryRes.data) {
          if (c?._id && (c?.name || c?.code)) map[c._id] = { name: c.name || c.code, code: c.code || '' };
        }
        countryMapRef.current = map;
      }

      if (regionRes.success && Array.isArray(regionRes.data)) {
        const map: Record<string, { name: string; countryCode: string }> = {};
        for (const r of regionRes.data) {
          if (r?._id && (r?.name || r?.code)) map[r._id] = { name: r.name || r.code, countryCode: r.countryCode || '' };
        }
        regionMapRef.current = map;
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  // Cari MU via search.searchAnything -> muIds -> mu.getById untuk nama.
  const searchMu = async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    setSuggestionLoading(true);
    try {
      const res = await fetchWarera('search.searchAnything', { searchText: trimmed }, token);
      let ids: string[] = [];
      if (res.success && Array.isArray(res.data?.muIds)) {
        ids = res.data.muIds;
      } else if (Array.isArray((res.data as any)?.muIds)) {
        ids = (res.data as any).muIds;
      }

      const results: MuSummary[] = [];
      for (const id of ids.slice(0, 6)) {
        if (muCacheRef.current[id]) {
          results.push(muCacheRef.current[id]);
          continue;
        }
        const muRes = await fetchWarera('mu.getById', { muId: id }, token);
        const mu = muRes?.data;
        if (mu?._id && mu?.name) {
          const item: MuSummary = {
            _id: mu._id,
            name: mu.name,
            region: mu.region,
            country: mu.country,
            members: Array.isArray(mu.members) ? mu.members : [],
          };
          muCacheRef.current[id] = item;
          results.push(item);
        }
      }

      setSuggestions(results);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionLoading(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => searchMu(value), 350);
  };

  // Resolve lokasi member dengan concurrency terbatas + cache dalam 1 sesi.
  const resolveMembers = async (userIds: string[]) => {
    const cache = new Map<string, MemberLocation>();
    const results: MemberLocation[] = [];
    let idx = 0;

    const worker = async () => {
      while (idx < userIds.length) {
        const id = userIds[idx++];
        if (cache.has(id)) {
          results.push(cache.get(id)!);
          continue;
        }
        const res = await fetchWarera('user.getUserById', { userId: id }, token);
        const u = res?.data;
        if (u && res.success) {
          const loc: MemberLocation = {
            userId: id,
            username: u.username || id.slice(0, 8),
            level: u.leveling?.level ?? 0,
            avatarUrl: u.avatarUrl,
            countryId: u.country,
            regionId: u.region,
            locationId: u.location,
            skills: u.skills,
            buffs: u.buffs ?? u.debuffs ?? undefined,
          };
          cache.set(id, loc);
          results.push(loc);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(RESOLVE_CONCURRENCY, userIds.length) }, () => worker())
    );

    return results;
  };

  const loadMembers = async (mu: MuSummary) => {
    setSelectedMuId(mu._id);
    setSelectedMuName(mu.name);
    setSearchInput('');
    setSuggestions([]);
    setMemberLoading(true);
    setError(null);
    setMembers([]);

    let userIds = Array.isArray(mu.members) ? mu.members : [];
    if (userIds.length === 0) {
      // fallback: ambil detail MU langsung
      const res = await fetchWarera('mu.getById', { muId: mu._id }, token);
      const detail = res?.data;
      const fresh: MuSummary = {
        _id: mu._id,
        name: res?.data?.name || mu.name,
        region: res?.data?.region || mu.region,
        country: res?.data?.country || mu.country,
        members: Array.isArray(detail?.members) ? detail.members : [],
      };
      muCacheRef.current[mu._id] = fresh;
      userIds = fresh.members;
    }

    if (!userIds || userIds.length === 0) {
      setError('MU ini belum punya anggota.');
      setMemberLoading(false);
      return;
    }

    const resolved = await resolveMembers(userIds);
    setMembers(resolved.sort((a, b) => a.username.localeCompare(b.username)));
    setMemberLoading(false);
  };

  const filtered = useMemo(() => {
    const q = searchInput.toLowerCase();
    const region = (id?: string) => (id && regionMapRef.current[id]?.name) || '';
    const country = (id?: string) => (id && countryMapRef.current[id]?.name) || '';
    const home = (m: MemberLocation) => country(m.regionId && regionMapRef.current[m.regionId]?.countryCode ? m.countryId : m.regionId) || region(m.regionId) || country(m.countryId) || '';
    const lokasi = (m: MemberLocation) => region(m.locationId) || region(m.regionId) || country(m.countryId) || '';

    const list = q
      ? members.filter(
          (m) =>
            m.username.toLowerCase().includes(q) ||
            region(m.regionId).toLowerCase().includes(q) ||
            country(m.countryId).toLowerCase().includes(q)
        )
      : members;

    if (!sortKey) return list;

    const getVal = (m: MemberLocation): string | number => {
      switch (sortKey) {
        case 'player':
          return m.username.toLowerCase();
        case 'lv':
          return m.level;
        case 'build':
          return buildWarEco(m).war - buildWarEco(m).eco;
        case 'buffs':
          return buffEndTime(m.buffs);
        case 'negara':
          return country(m.countryId).toLowerCase();
        case 'home':
          return home(m).toLowerCase();
        case 'lokasi':
          return lokasi(m).toLowerCase();
        default:
          return 0;
      }
    };

    return [...list].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [members, searchInput, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Lokasi Player</h3>
          {members.length > 0 && (
            <span className="text-[10px] text-slate-500 font-medium">
              {members.length} anggota
            </span>
          )}
        </div>
        {members.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-400 truncate max-w-[160px] sm:max-w-xs">
              {selectedMuName}
            </span>
            <button
              onClick={() => {
                const mu = muCacheRef.current[selectedMuId];
                if (mu) loadMembers(mu);
              }}
              disabled={memberLoading}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 font-semibold transition duration-150 cursor-pointer disabled:text-slate-600"
            >
              <RefreshCw className={`w-3 h-3 ${memberLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Cari MU — ketik nama */}
      <div className="bg-[#12141C] border border-slate-800/70 rounded-xl p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') searchMu(searchInput);
            }}
            placeholder="Ketik nama Military Unit..."
            className="flex-1 bg-[#08090C] text-slate-200 border border-slate-800 hover:border-slate-700 focus:border-emerald-500/50 rounded-lg px-3 py-2 text-xs font-semibold outline-none placeholder:text-slate-600"
          />
          {suggestionLoading && <Loader className="w-4 h-4 text-slate-500 animate-spin shrink-0" />}
        </div>

        {/* Results */}
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1">
            {suggestions.map((mu) => (
              <button
                key={mu._id}
                onClick={() => loadMembers(mu)}
                className="flex items-center justify-between gap-2 w-full text-left bg-[#0C0D13] border border-slate-800/70 hover:border-emerald-500/40 hover:bg-slate-800/40 rounded-lg px-3 py-2 transition duration-150 cursor-pointer"
              >
                <span className="text-xs font-semibold text-slate-200 truncate">{mu.name}</span>
                <span className="text-[10px] text-slate-500 shrink-0">
                  {Array.isArray(mu.members) ? mu.members.length : 0} anggota
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 border border-rose-500/30 bg-rose-500/10 text-rose-300 rounded-xl px-3.5 py-2.5 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading members */}
      {memberLoading && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-xs">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Menyelesaikan lokasi anggota...
        </div>
      )}

      {/* Tabel */}
      {!memberLoading && !error && members.length > 0 && (
        <div className="bg-[#12141C] border border-slate-800/70 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-800/80 text-[9.5px] text-slate-500 uppercase tracking-wider">
                  <th className="px-3.5 py-2.5 font-bold text-left">
                    <button onClick={() => handleSort('player')} className={`inline-flex items-center gap-1 uppercase text-[10px] tracking-wider cursor-pointer transition ${sortKey === 'player' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
                      Player {sortKey === 'player' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th className="px-3.5 py-2.5 font-bold text-left">
                    <button onClick={() => handleSort('lv')} className={`inline-flex items-center gap-1 uppercase text-[10px] tracking-wider cursor-pointer transition ${sortKey === 'lv' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
                      Lv {sortKey === 'lv' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th className="px-3.5 py-2.5 font-bold text-left">
                    <button onClick={() => handleSort('build')} className={`inline-flex items-center gap-1 uppercase text-[10px] tracking-wider cursor-pointer transition ${sortKey === 'build' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
                      Build {sortKey === 'build' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th className="px-3.5 py-2.5 font-bold text-left">
                    <button onClick={() => handleSort('buffs')} className={`inline-flex items-center gap-1 uppercase text-[10px] tracking-wider cursor-pointer transition ${sortKey === 'buffs' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
                      Buffs {sortKey === 'buffs' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th className="px-3.5 py-2.5 font-bold text-left">
                    <button onClick={() => handleSort('negara')} className={`inline-flex items-center gap-1 uppercase text-[10px] tracking-wider cursor-pointer transition ${sortKey === 'negara' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
                      Warga {sortKey === 'negara' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th className="px-3.5 py-2.5 font-bold text-left">
                    <button onClick={() => handleSort('home')} className={`inline-flex items-center gap-1 uppercase text-[10px] tracking-wider cursor-pointer transition ${sortKey === 'home' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
                      Domisili {sortKey === 'home' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th className="px-3.5 py-2.5 font-bold text-left">
                    <button onClick={() => handleSort('lokasi')} className={`inline-flex items-center gap-1 uppercase text-[10px] tracking-wider cursor-pointer transition ${sortKey === 'lokasi' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
                      Lokasi {sortKey === 'lokasi' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.userId} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt={m.username}
                            className="w-6 h-6 rounded-full shrink-0 bg-slate-800 object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full shrink-0 bg-slate-800 flex items-center justify-center text-[9px] text-slate-500 font-bold">
                            {(m.username[0] || '?').toUpperCase()}
                          </div>
                        )}
                        <span className="text-slate-200 font-semibold truncate">{m.username}</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-400 font-mono">{m.level}</td>
                    <td className="px-3.5 py-2.5">
                      {(() => {
                        const CRIT: Record<string, number> = {
                          attack: 0, precision: 0, criticalChance: 0, criticalDamages: 0,
                          armor: 0, dodge: 0, health: 0, hunger: 0, lootChance: 0,
                        };
                        const ECO: Record<string, number> = {
                          entrepreneurship: 0, energy: 0, production: 0, companies: 0, management: 0,
                        };
                        const ps = m.skills ?? {};
                        const cost = (l = 0) => (Math.max(0, Math.round(l)) * (Math.max(0, Math.round(l)) + 1)) / 2;
                        const warPts = Object.keys(CRIT).reduce((s, k) => s + cost(ps[k]?.level), 0);
                        const ecoPts = Object.keys(ECO).reduce((s, k) => s + cost(ps[k]?.level), 0);
                        if (warPts + ecoPts <= 0) return <span className="text-slate-600">—</span>;
                        const warPct = Math.round((warPts / (warPts + ecoPts)) * 100);
                        return (
                          <span className="inline-flex items-center gap-1">
                            {warPts > ecoPts ? (
                              <img src="/assets/flame.png" alt="War" className="w-5 h-5 object-contain" title={`War ${warPct}%`} />
                            ) : ecoPts > warPts ? (
                              <img src="/assets/cc-coin.png" alt="Eco" className="w-5 h-5 object-contain" title={`Eco ${100 - warPct}%`} />
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <img src="/assets/cc-coin.png" alt="Eco" className="w-5 h-5 object-contain" title="Eco" />
                                <img src="/assets/flame.png" alt="War" className="w-5 h-5 object-contain" title="War" />
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {(() => {
                        const b = m.buffs;
                        const debuffCodes = Array.isArray(b?.debuffCodes) ? b.debuffCodes : [];
                        const buffCodes = Array.isArray(b?.buffCodes) ? b.buffCodes : [];
                        if (debuffCodes.length === 0 && buffCodes.length === 0) return <span className="text-slate-600">Ready</span>;
                        const fmtLeft = (endAt?: string) => {
                          if (!endAt) return '';
                          const ms = new Date(endAt).getTime() - Date.now();
                          if (ms <= 0) return 'habis';
                          const m = Math.floor(ms / 60000);
                          if (m < 60) return `${m}m`;
                          const h = Math.floor(m / 60);
                          return `${h}j ${m % 60}m`;
                        };
                        return (
                          <span className="inline-flex items-center gap-1">
                            {debuffCodes.map((code) => (
                              <span
                                key={`d-${code}`}
                                className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-full px-2 py-0.5"
                                title={`Debuff ${code} sampai ${b?.debuffEndAt ? new Date(b.debuffEndAt).toLocaleString() : '?'}`}
                              >
                                <img src="/assets/debuff.png" alt="debuff" className="w-3.5 h-3.5 object-contain" />
                                {fmtLeft(b?.debuffEndAt)}
                              </span>
                            ))}
                            {buffCodes.map((code) => (
                              <span
                                key={`b-${code}`}
                                className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5"
                                title={`Buff ${code} sampai ${b?.buffEndAt ? new Date(b.buffEndAt).toLocaleString() : '?'}`}
                              >
                                <img src="/assets/buff.png" alt="buff" className="w-3.5 h-3.5 object-contain" />
                                {fmtLeft(b?.buffEndAt)}
                              </span>
                            ))}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-300">
                      {(() => {
                        const c = m.countryId && countryMapRef.current[m.countryId];
                        if (!c) return '—';
                        return <span className="inline-flex items-center gap-0.5"><CountryFlagPng code={c.code} />{c.name}</span>;
                      })()}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-300">
                      {(m.regionId && regionMapRef.current[m.regionId]?.name) || '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-400">
                      {(() => {
                        const loc = m.locationId && regionMapRef.current[m.locationId];
                        if (!loc) return <span className="font-mono">{m.locationId ? m.locationId.slice(0, 8) : '—'}</span>;
                        return <span className="inline-flex items-center"><CountryFlagPng code={loc.countryCode} />{loc.name}</span>;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!memberLoading && !error && members.length === 0 && (
        <div className="bg-[#12141C] border border-dashed border-slate-800 rounded-xl p-8 text-center">
          <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">
            Ketik nama Military Unit untuk melihat lokasi para anggotanya.
          </p>
        </div>
      )}
    </div>
  );
}