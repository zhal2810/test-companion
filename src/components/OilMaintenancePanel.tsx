import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Droplet, RefreshCw, AlertCircle, Shield, MapPin } from 'lucide-react';
import ItemIcon from './ItemIcon';

type UpgradeStatus = 'active' | 'activating' | 'off';

interface RegionOil {
  regionId: string;
  code: string;
  name: string;
  development: number;
  bunkerLevel: number;
  bunkerStatus: UpgradeStatus;
  pacificationCenterLevel: number;
  pacificationCenterStatus: UpgradeStatus;
  oilPerHour: number;
  goldPerHour: number;
}

interface OilMaintenanceData {
  countryId: string;
  oilPrice: number;
  averageDevelopment: number;
  fetchedAt: string;
  regions: RegionOil[];
  counts: { active: number; activating: number; off: number };
  totalOilPerHour: number;
  totalGoldPerHour: number;
}

interface OilMaintenancePanelProps {
  countryId: string;
  token?: string | null;
}

function formatNum(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return '0';
  return value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function getStatusColor(status: UpgradeStatus): string {
  switch (status) {
    case 'active':
      return 'text-emerald-400';
    case 'activating':
      return 'text-amber-400';
    default:
      return 'text-slate-500';
  }
}

export default function OilMaintenancePanel({ countryId, token }: OilMaintenancePanelProps) {
  const [data, setData] = useState<OilMaintenanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ countryId });
        if (force) params.set('_', String(Date.now()));
        const headers: Record<string, string> = {};
        if (token) headers['X-API-Key'] = token;
        const res = await fetch(`/api/tracker/oil-maintenance?${params.toString()}`, { headers });
        const json = await res.json();
        if (!json.success || !json.data) throw new Error(json.error || 'Gagal memuat data oil maintenance');
        setData(json.data);
      } catch (err: any) {
        setError(err.message || 'Terjadi kesalahan');
      } finally {
        setLoading(false);
      }
    },
    [countryId, token],
  );

  useEffect(() => {
    load();
  }, [load]);

  const regionsWithUpgrade = data
    ? data.regions.filter((r) => r.bunkerLevel > 0 || r.pacificationCenterLevel > 0)
    : [];

  const grouped = data
    ? {
        active: data.regions.filter(
          (r) => r.bunkerStatus === 'active' || r.pacificationCenterStatus === 'active',
        ),
        activating: data.regions.filter(
          (r) => r.bunkerStatus === 'activating' || r.pacificationCenterStatus === 'activating',
        ),
        off: data.regions.filter((r) => r.bunkerLevel > 0 || r.pacificationCenterLevel > 0),
      }
    : { active: [], activating: [], off: [] };

  // "Off" hanya berisi region yang punya upgrade (level > 0) tapi non-aktif.
  const offList = data ? regionsWithUpgrade.filter((r) => !grouped.active.includes(r) && !grouped.activating.includes(r)) : [];

  const renderRegionRow = (r: RegionOil) => (
    <div
      key={r.regionId}
      className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800/40 last:border-b-0 hover:bg-slate-800/20 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <MapPin className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-200 truncate">{r.name}</span>
        {r.oilPerHour > 0 ? (
          <span className="text-[10px] text-slate-500 whitespace-nowrap">dev {formatNum(r.development)}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-slate-500">B{Math.max(r.bunkerLevel, 0)}</span>
        <span className="text-[10px] text-slate-500">PC{Math.max(r.pacificationCenterLevel, 0)}</span>
        <span className={`text-xs font-bold font-mono ${r.oilPerHour > 0 ? 'text-amber-300' : 'text-slate-600'}`}>
          {formatNum(r.oilPerHour)}
        </span>
        <span className="text-[10px] text-slate-500 font-mono">/h</span>
        <span className={`text-xs font-mono ${r.goldPerHour > 0 ? 'text-sky-300' : 'text-slate-700'}`}>
          {formatNum(r.goldPerHour)}g
        </span>
      </div>
    </div>
  );

  const renderGroup = (label: string, count: number, list: RegionOil[], status: UpgradeStatus) => (
    <div>
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span className={`text-[9px] font-bold uppercase tracking-wider ${getStatusColor(status)}`}>
          {label}
        </span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
          {count}
        </span>
      </div>
      {list.length === 0 ? (
        <div className="px-3 pb-2 text-[11px] text-slate-600">Tidak ada region.</div>
      ) : (
        list.map(renderRegionRow)
      )}
    </div>
  );

  return (
    <div className="bg-[#0C0D13] border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-slate-800/20 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 shrink-0">
            <ItemIcon itemCode="oil" size="sm" className="w-full h-full object-contain" />
          </div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Oil Maintenance
          </span>
          {data && (
            <span className="text-[10px] text-slate-500 whitespace-nowrap">
              {regionsWithUpgrade.length} region · {formatNum(data.oilPrice)} g/oil
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data && !loading && (
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Aktif {data.counts.active}
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                Aktifkan {data.counts.activating}
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-800 text-slate-500">
                Off {data.counts.off}
              </span>
            </div>
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-slate-800">
          {loading && (
            <div className="p-6 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-500" />
              <span className="text-xs text-slate-400">Menghitung konsumsi Oil...</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-rose-400">Gagal memuat data</h4>
                <p className="text-xs text-rose-300/70 mt-1">{error}</p>
                <button
                  onClick={() => load(true)}
                  className="text-xs text-sky-400 font-bold mt-2 hover:text-sky-300 cursor-pointer"
                >
                  Coba lagi
                </button>
              </div>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Total bar */}
              <div className="flex items-center justify-between px-3 py-2 bg-[#12141C] border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Droplet className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] text-slate-400 font-semibold">Total Maintenance</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-mono font-bold text-amber-300">
                    {formatNum(data.totalOilPerHour)} oil/h
                  </span>
                  <span className="font-mono font-bold text-sky-300">
                    {formatNum(data.totalGoldPerHour)} g/h
                  </span>
                </div>
              </div>

              {/* Mobile status chips */}
              <div className="sm:hidden flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  Aktif {data.counts.active}
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  Aktifkan {data.counts.activating}
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-800 text-slate-500">
                  Off {data.counts.off}
                </span>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {renderGroup('Active', grouped.active.length, grouped.active, 'active')}
                {renderGroup('Activating', grouped.activating.length, grouped.activating, 'activating')}
                {renderGroup('Off', offList.length, offList, 'off')}
              </div>

              <div className="px-3 py-2 border-t border-slate-800 flex items-center gap-1.5 text-[10px] text-slate-600">
                <Shield className="w-3 h-3" />
                Hanya upgrade berstatus aktif yang mengonsumsi Oil. Diperbarui {data.fetchedAt ? new Date(data.fetchedAt).toLocaleString('id-ID') : 'baru saja'}.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
