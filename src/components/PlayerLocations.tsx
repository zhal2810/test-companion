import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWarera } from '../api/apiClient';
import { MapPin, RefreshCw, AlertCircle, Users, Search } from 'lucide-react';

// Tab Lokasi — daftar anggota Military Unit (MU) beserta lokasi mereka
// (negara/region/lokasi) yang diambil dari user.getUserById (semua ID
// di-resolve jadi nama via country.getAllCountries + region.getAll).

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
  const [muList, setMuList] = useState<MuSummary[]>([]);
  const [muLoading, setMuLoading] = useState(true);
  const [selectedMuId, setSelectedMuId] = useState('');
  const [selectedMuName, setSelectedMuName] = useState('');
  const [members, setMembers] = useState<MemberLocation[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const countryMapRef = useRef<Record<string, string>>({});
  const regionMapRef = useRef<Record<string, string>>({});

  // Satu kali muat: daftar MU + map negara + map region
  useEffect(() => {
    let mounted = true;

    (async () => {
      setMuLoading(true);
      setError(null);

      const [muRes, countryRes, regionRes] = await Promise.all([
        fetchWarera('mu.getManyPaginated', { page: 1, limit: 200 }, token),
        fetchWarera('country.getAllCountries', {}, token),
        fetchWarera('region.getAll', {}, token),
      ]);

      if (!mounted) return;

      if (muRes.success && Array.isArray(muRes.data)) {
        setMuList(muRes.data);
      } else if (Array.isArray((muRes.data as any)?.items)) {
        setMuList((muRes.data as any).items);
      } else {
        setError('Gagal memuat daftar Military Unit.');
      }

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

      setMuLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

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

  const loadMembers = async (muId: string) => {
    setMemberLoading(true);
    setError(null);
    setMembers([]);

    const res = await fetchWarera('mu.getById', { muId }, token);
    const mu = res?.data;
    const fallbackMu = muList.find((m) => m._id === muId);
    const userIds =
      Array.isArray(mu?.members) && mu.members.length > 0
        ? mu.members
        : Array.isArray(fallbackMu?.members) && fallbackMu.members.length > 0
          ? fallbackMu.members
          : [];

    if (!mu || userIds.length === 0) {
      if (!res.success) setError(res.error || 'Gagal memuat anggota MU.');
      else setError('MU ini belum punya anggota.');
      setMemberLoading(false);
      return;
    }

    const resolved = await resolveMembers(userIds);
    setMembers(resolved.sort((a, b) => a.username.localeCompare(b.username)));
    setMemberLoading(false);
  };

  const handleSelectMu = (muId: string) => {
    setSelectedMuId(muId);
    const mu = muList.find((m) => m._id === muId);
    setSelectedMuName(mu?.name || '');
    if (muId) loadMembers(muId);
  };

  const filtered = useMemo(() => {
    if (!search) return members;
    const q = search.toLowerCase();
    const region = (id?: string) => (id && regionMapRef.current[id]) || '';
    const country = (id?: string) => (id && countryMapRef.current[id]) || '';
    return members.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        region(m.regionId).toLowerCase().includes(q) ||
        country(m.countryId).toLowerCase().includes(q)
    );
  }, [members, search]);

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
          <button
            onClick={() => handleSelectMu(selectedMuId)}
            disabled={memberLoading}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 font-semibold transition duration-150 cursor-pointer disabled:text-slate-600"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${memberLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {/* Pilih MU */}
      <div className="bg-[#12141C] border border-slate-800/70 rounded-xl p-3.5 flex flex-col sm:flex-row gap-2.5">
        <div className="flex-1 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500 shrink-0" />
          <select
            value={selectedMuId}
            onChange={(e) => handleSelectMu(e.target.value)}
            disabled={muLoading}
            className="flex-1 bg-[#08090C] text-slate-200 border border-slate-800 hover:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer outline-none disabled:opacity-50"
          >
            <option value="">
              {muLoading ? 'Memuat daftar MU...' : 'Pilih Military Unit...'}
            </option>
            {muList.map((mu) => (
              <option key={mu._id} value={mu._id}>
                {mu.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search */}
      {members.length > 0 && (
        <div className="flex items-center gap-2 bg-[#12141C] border border-slate-800/70 rounded-xl px-3.5 py-2.5">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama / negara / region..."
            className="flex-1 bg-transparent text-slate-200 text-xs outline-none placeholder:text-slate-600"
          />
        </div>
      )}

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
                  <th className="px-3.5 py-2.5 font-bold">Region</th>
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
                      {m.locationId ? m.locationId.slice(0, 8) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!muLoading && !memberLoading && !error && members.length === 0 && (
        <div className="bg-[#12141C] border border-dashed border-slate-800 rounded-xl p-8 text-center">
          <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">
            Pilih Military Unit untuk melihat lokasi para anggotanya.
          </p>
        </div>
      )}
    </div>
  );
}