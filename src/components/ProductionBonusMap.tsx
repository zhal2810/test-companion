import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWarera } from '../api/apiClient';
import { ITEM_NAMES } from '../data/gameConfigStore';
import { GAME_ITEMS } from '../data/gameConfig';
import { Percent, RefreshCw, AlertCircle, Loader } from 'lucide-react';

// Tab Bonus — pilih item, lihat peringkat region dengan bonus produksi
// dari company.getRecommendedRegionIdsByItemCode. Bisa difilter per aliansi
// (berdasarkan negara penguasa region) dan kolom Deposit bisa disembunyikan.

const ITEM_CODES: string[] = [
  'cookedFish', 'heavyAmmo', 'steel', 'bread', 'grain', 'limestone', 'coca',
  'concrete', 'oil', 'lightAmmo', 'steak', 'livestock', 'cocain', 'lead',
  'fish', 'petroleum', 'ammo', 'iron', 'scraps', 'wood', 'paper',
];

function itemName(code: string): string {
  const g = GAME_ITEMS[code];
  if (g?.name) return g.name;
  return ITEM_NAMES[code] || code;
}

function formatDepositLeft(endAt?: string, nowMs: number = Date.now()): string {
  if (!endAt) return '-';
  const target = new Date(endAt).getTime();
  const diff = target - nowMs;
  if (diff <= 0) return 'habis';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days} hari - ${hours} jam`;
  if (hours > 0) return `${hours} jam - ${mins} mnt`;
  return `${Math.max(mins, 1)} mnt`;
}

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return '';
  const c = code.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + c.charCodeAt(0) - 65,
    0x1f1e6 + c.charCodeAt(1) - 65,
  );
}

function CountryFlagPng({ code, className = 'w-4.5 h-3.5 object-cover rounded shadow-sm border border-slate-800/40 inline-block align-middle' }: { code?: string; className?: string }) {
  const [error, setError] = React.useState(false);
  const clean = code?.toLowerCase() || '';
  const url = clean.length === 2 ? `https://flagcdn.com/w40/${clean}.png` : '';

  React.useEffect(() => {
    setError(!url);
  }, [url]);

  if (error || !url) {
    const emoji = flagEmoji(clean);
    return <span className="inline-block align-middle leading-none">{emoji || '🏳️'}</span>;
  }

  return <img src={url} alt={clean} className={className} onError={() => setError(true)} referrerPolicy="no-referrer" />;
}

interface BonusRegion {
  regionId: string;
  bonus: number;
  taxPercent: number;
  depositBonus?: number;
  depositEndAt?: string;
}

interface AllianceSummary {
  _id: string;
  name: string;
  memberCountryIds: string[];
}

export default function ProductionBonusMap({ token }: { token?: string | null }) {
  const [itemCode, setItemCode] = useState('coca');
  const [alliances, setAlliances] = useState<AllianceSummary[]>([]);
  const [allianceId, setAllianceId] = useState('');
  const [showDeposit, setShowDeposit] = useState(true);
  const [regions, setRegions] = useState<BonusRegion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const regionNameRef = useRef<Record<string, { name: string; ownerCode: string; homeCode: string }>>({});
  const ownerCountryRef = useRef<Record<string, string>>({});

  // Load peta region + daftar aliansi sekali.
  useEffect(() => {
    let mounted = true;

    (async () => {
      const [regionRes, allianceRes, countryRes] = await Promise.all([
        fetchWarera('region.getAll', {}, token),
        fetchWarera('alliance.getManyPaginated', { page: 1, limit: 100 }, token),
        fetchWarera('country.getAllCountries', {}, token),
      ]);

      if (!mounted) return;

      const countryCodeMap: Record<string, string> = {};
      if (countryRes.success && Array.isArray(countryRes.data)) {
        for (const c of countryRes.data) {
          if (c?._id && c?.code) countryCodeMap[c._id] = c.code;
        }
      }

      if (regionRes.success && Array.isArray(regionRes.data)) {
        const map: Record<string, { name: string; ownerCode: string; homeCode: string }> = {};
        const ownerMap: Record<string, string> = {};
        for (const r of regionRes.data) {
          if (!r?._id) continue;
          const ownerCode =
            (r.country && countryCodeMap[r.country]) || r.countryCode || '';
          map[r._id] = {
            name: r.name || r.code || r._id,
            ownerCode,
            homeCode: r.countryCode || '',
          };
          if (r.country) ownerMap[r._id] = r.country;
        }
        regionNameRef.current = map;
        ownerCountryRef.current = ownerMap;
      }

      if (allianceRes.success && Array.isArray(allianceRes.data?.items)) {
        const list: AllianceSummary[] = allianceRes.data.items.map((a: any) => ({
          _id: a._id,
          name: a.name || a._id,
          memberCountryIds: Array.isArray(a.memberCountries)
            ? a.memberCountries.map((mc: any) => mc.country).filter(Boolean)
            : [],
        }));
        setAlliances(list);
      } else if (Array.isArray((allianceRes.data as any)?.items)) {
        const list: AllianceSummary[] = (allianceRes.data as any).items.map((a: any) => ({
          _id: a._id,
          name: a.name || a._id,
          memberCountryIds: Array.isArray(a.memberCountries)
            ? a.memberCountries.map((mc: any) => mc.country).filter(Boolean)
            : [],
        }));
        setAlliances(list);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  // Timer ulang untuk hitung sisa deposit setiap menit.
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(iv);
  }, []);

  const loadBonus = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWarera('company.getRecommendedRegionIdsByItemCode', { itemCode: code }, token);
      let list: BonusRegion[] = [];
      if (res.success && Array.isArray(res.data)) {
        list = res.data.map((r: any) => ({
          regionId: r.regionId,
          bonus: r.bonus ?? 0,
          taxPercent: r.taxPercent ?? 0,
          depositBonus: r.depositBonus,
          depositEndAt: r.depositEndAt,
        }));
      } else if (Array.isArray((res.data as any))) {
        list = (res.data as any).map((r: any) => ({
          regionId: r.regionId,
          bonus: r.bonus ?? 0,
          taxPercent: r.taxPercent ?? 0,
          depositBonus: r.depositBonus,
          depositEndAt: r.depositEndAt,
        }));
      }
      setRegions(list);
    } catch {
      setError('Gagal memuat data bonus.');
      setRegions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBonus(itemCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCode, token]);

  const selectedAlliance = useMemo(
    () => alliances.find((a) => a._id === allianceId) || null,
    [alliances, allianceId],
  );

  const filteredRows = useMemo(() => {
    const rows = regions.map((r) => {
      const meta = regionNameRef.current[r.regionId];
      const ownerCountryId = ownerCountryRef.current[r.regionId];
      return { ...r, meta, ownerCountryId };
    });
    if (!selectedAlliance || selectedAlliance.memberCountryIds.length === 0) {
      return rows;
    }
    return rows.filter((r) => r.ownerCountryId && selectedAlliance.memberCountryIds.includes(r.ownerCountryId));
  }, [regions, selectedAlliance]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Percent className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Bonus Produksi</h3>
          {regions.length > 0 && (
            <span className="text-[10px] text-slate-500 font-medium">
              {filteredRows.length} region
            </span>
          )}
        </div>
        {regions.length > 0 && (
          <button
            onClick={() => loadBonus(itemCode)}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 font-semibold transition duration-150 cursor-pointer disabled:text-slate-600"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {/* Kontrol: item, aliansi */}
      <div className="bg-[#12141C] border border-slate-800/70 rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Item</span>
          <select
            value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            className="bg-[#08090C] text-slate-200 border border-slate-800 hover:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold outline-none cursor-pointer"
          >
            {ITEM_CODES.map((c) => (
              <option key={c} value={c}>{itemName(c)} ({c})</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aliansi</span>
          <select
            value={allianceId}
            onChange={(e) => setAllianceId(e.target.value)}
            className="bg-[#08090C] text-slate-200 border border-slate-800 hover:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold outline-none cursor-pointer"
          >
            <option value="">Semua</option>
            {alliances.map((a) => (
              <option key={a._id} value={a._id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-950/20 border border-rose-500/20 text-rose-300 rounded-lg px-3 py-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-xs">
          <Loader className="w-4 h-4 animate-spin" />
          Memuat bonus region...
        </div>
      )}

      {/* Tabel */}
      {!loading && !error && regions.length > 0 && (
        <div className="bg-[#12141C] border border-slate-800/70 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[520px]">
              <thead>
                <tr className="border-b border-slate-800/80 text-[9.5px] text-slate-500 uppercase tracking-wider">
                  <th className="px-3.5 py-2.5 font-bold">Nama Region</th>
                  <th className="px-3.5 py-2.5 font-bold">Negara</th>
                  <th className="px-3.5 py-2.5 font-bold">Bonus</th>
                  <th className="px-3.5 py-2.5 font-bold">Pajak</th>
                  <th className="px-3.5 py-2.5 font-bold">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showDeposit}
                          onChange={(e) => setShowDeposit(e.target.checked)}
                          className="accent-emerald-500"
                        />
                        Deposit
                      </label>
                    </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.regionId} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-200 font-semibold">{r.meta?.name || r.regionId.slice(0, 8)}</td>
                    <td className="px-3.5 py-2.5 text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        {r.meta?.ownerCode && <CountryFlagPng code={r.meta.ownerCode} />}
                        {r.meta?.homeCode && r.meta.homeCode !== r.meta?.ownerCode && (
                          <CountryFlagPng code={r.meta.homeCode} />
                        )}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-emerald-400 font-mono font-bold">{r.bonus}%</td>
                    <td className="px-3.5 py-2.5 text-slate-400 font-mono">{r.taxPercent}%</td>
                    {showDeposit && (
                      <td className="px-3.5 py-2.5 text-slate-400 font-mono">{formatDepositLeft(r.depositEndAt, now)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && regions.length === 0 && (
        <div className="bg-[#12141C] border border-dashed border-slate-800 rounded-xl p-8 text-center">
          <Percent className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">
            Tidak ada region dengan bonus produksi untuk item ini.
          </p>
        </div>
      )}
    </div>
  );
}