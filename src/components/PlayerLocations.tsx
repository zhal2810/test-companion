import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWarera } from '../api/apiClient';
import { MapPin, RefreshCw, AlertCircle, Users, Search, Loader } from 'lucide-react';

// Tab Lokasi — ketik nama Military Unit (MU), lalu lihat daftar anggota
// beserta lokasi mereka (negara/region/lokasi) yang di-resolve via
// user.getUserById + country.getAllCountries + region.getAll.
// Pencarian MU memakai search.searchAnything (mengembalikan muIds).

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
}

interface PlayerLocationsProps {
  token?: string | null;
}

const RESOLVE_CONCURRENCY = 5;

export default function PlayerLocations({ token }: PlayerLocationsProps) {
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<MuSummary[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [selectedMuId, setSelectedMuId] = useState('');
  const [selectedMuName, setSelectedMuName] = useState('');
  const [members, setMembers] = useState<MemberLocation[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countryMapRef = useRef<Record<string, string>>({});
  const regionMapRef = useRef<Record<string, string>>({});
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
        const map: Record<string, string> = {};
        for (const c of countryRes.data) {
          if (c?._id && c?.name) map[c._id] = c.name;
        }
        countryMapRef.current = map;
      }

      if (regionRes.success && Array.isArray(regionRes.data)) {
        const map: Record<string, string> = {};
        for (const r of regionRes.data) {
          if (r?._id && (r?.name || r?.code)) map[r._id] = r.name || r.code;
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
    if (!searchInput) return members;
    const q = searchInput.toLowerCase();
    const region = (id?: string) => (id && regionMapRef.current[id]) || '';
    const country = (id?: string) => (id && countryMapRef.current[id]) || '';
    return members.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        region(m.regionId).toLowerCase().includes(q) ||
        country(m.countryId).toLowerCase().includes(q)
    );
  }, [members, searchInput]);

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
            placeholder="Ketik nama Military Unit... (mis. Komando Lapis)"
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
                  <th className="px-3.5 py-2.5 font-bold">Player</th>
                  <th className="px-3.5 py-2.5 font-bold">Lv</th>
                  <th className="px-3.5 py-2.5 font-bold">Negara</th>
                  <th className="px-3.5 py-2.5 font-bold">Home</th>
                  <th className="px-3.5 py-2.5 font-bold">Lokasi</th>
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
                    <td className="px-3.5 py-2.5 text-slate-300">
                      {(m.countryId && countryMapRef.current[m.countryId]) || '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-300">
                      {(m.regionId && regionMapRef.current[m.regionId]) || '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-400 font-mono">
                      {(m.locationId && regionMapRef.current[m.locationId]) || (m.locationId ? m.locationId.slice(0, 8) : '—')}
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