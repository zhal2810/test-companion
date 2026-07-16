import React, { useState, useEffect } from 'react';
import { getCompaniesByUserId, getProductionBonus, getWorkersByUserId, getUserEcoSkills, getGameConfig, fetchWarera } from '../api/apiClient';
import { AE_PP_PER_DAY, calculateWorkerDailyOutput } from './production';
import { Cpu, Users, Percent, MapPin, Coins, Building2, TrendingUp, ChevronDown, RefreshCw, AlertCircle, Package, Wallet, Landmark, Sword, Shirt } from 'lucide-react';
import ItemIcon from './ItemIcon';

interface CompanyAnalysisProps {
  userId: string;
  token: string | null;
}

function formatMoney(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return "0";
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    return (value / 1000).toFixed(1).replace(/\.0$/, '') + "K";
  }
  return parseFloat(value.toFixed(2)).toString();
}

// Breakdown "kekayaan real" pemain langsung dari user.getUserById -> wealth
// { companies, items, money, equipments, weapons, total }
export function WealthSummary({ wealth }: { wealth: any }) {
  if (!wealth || typeof wealth !== 'object') return null;

  const rows = [
    { key: 'money', label: 'Cash', icon: Coins, value: wealth.money },
    { key: 'companies', label: 'Nilai Company', icon: Building2, value: wealth.companies },
    { key: 'items', label: 'Item / Barang', icon: Package, value: wealth.items },
    { key: 'equipments', label: 'Equipment', icon: Shirt, value: wealth.equipments },
    { key: 'weapons', label: 'Senjata', icon: Sword, value: wealth.weapons },
  ].filter((row) => typeof row.value === 'number');

  const total = typeof wealth.total === 'number'
    ? wealth.total
    : rows.reduce((sum, r) => sum + (r.value || 0), 0);

  return (
    <div className="bg-[#12141C] border border-slate-800 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3 text-[10px] uppercase tracking-widest font-bold text-slate-500">
        <Landmark className="w-3.5 h-3.5" />
        Kekayaan Real (Net Worth)
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {rows.map(({ key, label, icon: Icon, value }) => (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <Icon className="w-3 h-3" />
              {label}
            </div>
            <div className="text-sm font-bold font-mono text-slate-200">{formatMoney(value)} cc</div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-800 mt-3 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
          <Wallet className="w-3.5 h-3.5" />
          Total
        </div>
        <div className="text-lg font-black font-mono text-emerald-400">{formatMoney(total)} cc</div>
      </div>
    </div>
  );
}

export default function CompanyAnalysis({ userId, token }: CompanyAnalysisProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<any>(null);

  const [regionsDict, setRegionsDict] = useState<Record<string, any>>({});
  const [productionBonusDict, setProductionBonusDict] = useState<Record<string, any>>({});
  const [workersByCompanyId, setWorkersByCompanyId] = useState<Record<string, any[]>>({});
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [marketPrices, setMarketPrices] = useState<Record<string, any>>({});
  const [itemsConfig, setItemsConfig] = useState<Record<string, any>>({});

  const loadProductionBonuses = async (companies: any[] = []) => {
    const ids = companies.map((c) => c?._id).filter(Boolean);
    if (ids.length === 0) return;

    const results = await Promise.all(
      ids.map((companyId) => getProductionBonus(companyId, token))
    );

    setProductionBonusDict((prev) => {
      const next = { ...prev };
      ids.forEach((companyId, index) => {
        if (results[index]?.success) {
          next[companyId] = results[index].data;
        }
      });
      return next;
    });
  };

  const loadGeographyContext = async () => {
    const regionsRes = await fetchWarera('region.getRegionsObject', {}, token);
    const regionsPayload = regionsRes?.data ?? (regionsRes as any)?.result?.data ?? regionsRes;

    const normalizeRegions = (payload: any) => {
      if (Array.isArray(payload)) return payload.filter(Boolean);
      if (!payload || typeof payload !== 'object') return [];
      if (Array.isArray(payload.regions)) return payload.regions.filter(Boolean);
      return Object.entries(payload)
        .map(([key, value]: [string, any]) => (!value || typeof value !== 'object' || Array.isArray(value)) ? null : { ...value, __fallbackKey: key })
        .filter(Boolean);
    };

    const regionalRecords = normalizeRegions(regionsPayload);
    const combinedRegions = regionalRecords.reduce((acc: any, region: any) => {
      const regionId = region?._id || region?.id || region?.regionId || region?.__fallbackKey;
      if (regionId) acc[regionId] = { ...region, _id: regionId };
      return acc;
    }, {});

    setRegionsDict(combinedRegions);
  };

  useEffect(() => {
    loadGeographyContext();
  }, []);

  useEffect(() => {
    (async () => {
      const cfgRes = await getGameConfig(token);
      if (cfgRes.success && cfgRes.data?.items) {
        setItemsConfig(cfgRes.data.items);
      }
    })();
  }, []);

  useEffect(() => {
    if (!userId) {
      setData(null);
      return;
    }
    handleAnalyse();
  }, [userId, token]);

  const handleAnalyse = async () => {
    setIsLoading(true);
    setErrorMsg('');
    const result = await getCompaniesByUserId(userId, token);
    if (result.success) {
      setData(result);
      const priceRes = await fetchWarera('itemTrading.getPrices', {}, token);
      if (priceRes.success && priceRes.data) setMarketPrices(priceRes.data);
      await loadProductionBonuses(result.companies || []);

      const workersRes = await getWorkersByUserId(userId, token);
      if (workersRes.success) {
        const workersByCompany = workersRes.data;

        const uniqueUserIds = [...new Set(
          Object.values(workersByCompany).flat().map((w) => w?.user).filter(Boolean)
        )] as string[];

        const skillsResults = await Promise.all(
          uniqueUserIds.map((uid) => getUserEcoSkills(uid, token))
        );
        const skillsByUserId = uniqueUserIds.reduce((acc: any, uid, index) => {
          acc[uid] = skillsResults[index]?.data || { energyValue: 0, productionValue: 0 };
          return acc;
        }, {});

        const enrichedWorkersByCompany = Object.fromEntries(
          Object.entries(workersByCompany).map(([companyId, workerList]) => [
            companyId,
            workerList.map((w) => ({ ...w, ...(skillsByUserId[w?.user] || {}) })),
          ])
        );

        setWorkersByCompanyId(enrichedWorkersByCompany);
      }
    } else {
      setErrorMsg(result.error || 'Gagal memuat profil atau perusahaan');
    }
    setIsLoading(false);
  };

  const companies = data?.companies || [];

  return (
    <div className="animate-fade-in text-slate-200">
      
      {/* HEADER CONTROLS */}
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
          {data?.playerData?.username ? `Pemain: ${data.playerData.username}` : 'Company Analysis'}
        </div>
        <button 
          onClick={handleAnalyse} 
          disabled={isLoading} 
          className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[#e67e22] hover:text-[#f39c12] text-xs font-bold px-3 py-1.5 rounded-lg transition duration-200 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'MEMUAT...' : 'Refresh'}
        </button>
      </div>

      {/* COMPANIES LIST */}
      {!isLoading && companies.length > 0 ? (
        <div className="space-y-4">
          {companies.map((comp: any, index: number) => {
            const id = comp?._id || index;
            return (
              <CompanyListItem
                key={id}
                comp={comp}
                regionsDict={regionsDict}
                productionBonus={comp?._id ? productionBonusDict[comp._id] : undefined}
                workers={comp?._id ? (workersByCompanyId[comp._id] || []) : []}
                isExpanded={expandedId === id}
                onToggle={() => setExpandedId(prev => prev === id ? null : id)}
                marketPrices={marketPrices}
                itemsConfig={itemsConfig}
              />
            );
          })}
        </div>
      ) : !isLoading ? (
        <div className="bg-[#12141C] border border-dashed border-slate-800 rounded-xl p-8 text-center">
          <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-2.5" />
          <h3 className="text-sm font-bold text-slate-300">Belum ada data perusahaan</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Sistem tidak mendeteksi perusahaan di profil ini atau API Token belum terkonfigurasi.
          </p>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500 text-xs flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
          <span>Menganalisis performa pabrik dan buruh...</span>
        </div>
      )}
    </div>
  );
}

function CompanyListItem({ comp, regionsDict, productionBonus, isExpanded, onToggle, marketPrices, workers = [], itemsConfig = {} }: any) {
  const aeLevel = Number(comp?.activeUpgradeLevels?.automatedEngine ?? comp?.automatedEngine ?? 0);
  const ppPerDay = AE_PP_PER_DAY[aeLevel] ?? 0;
  
  const storageLevel = Number(comp?.activeUpgradeLevels?.storage ?? comp?.storageLevel ?? comp?.storage?.level ?? 0);
  const maxStorage = storageLevel * 200;

  const pickNumeric = (source: any, keys: string[]) => {
    for (const key of keys) {
      const value = key.split('.').reduce((acc, part) => acc?.[part], source);
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
  };

  const productionValue = pickNumeric(comp, ['production', 'dailyProduction', 'output', 'generatedProduction']);
  const productionBonusValue = pickNumeric(productionBonus, ['total', 'efficiency', 'productionBonus', 'bonus']);
  const currentProduction = Number(comp?.production ?? 0);

  const progressPercent = maxStorage > 0 ? Math.min((currentProduction / maxStorage) * 100, 100) : 0;
  const barColor = progressPercent >= 90 ? 'bg-rose-500' : progressPercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

  const regionId = comp?.region;
  const regionData = regionsDict[regionId];
  const countryData = regionData?.countryData;

  const totalEfficiency = productionBonusValue !== null ? 100 + productionBonusValue : null;

  const breakdownNotes = (() => {
    if (!productionBonus) {
      return ['⏳ Memuat bonus regional dan upah buruh...'];
    }
    const notes = [];
    const { strategicBonus = 0, depositBonus = 0, ethicSpecializationBonus = 0, ethicDepositBonus = 0, total = 0 } = productionBonus;
    const nationBonus = strategicBonus + depositBonus;
    const partyBonus = ethicSpecializationBonus + ethicDepositBonus;

    notes.push(`+${total.toFixed(2)}% Total Bonus`);
    if (nationBonus !== 0 || partyBonus !== 0) {
      notes.push(`├─ ${nationBonus.toFixed(2)}% Negara (Nation)`);
      notes.push(`└─ ${partyBonus.toFixed(2)}% Partai (Party/Ethic)`);
    }
    if (countryData?.taxes?.income !== undefined && countryData?.taxes?.income !== null) {
      notes.push(`ℹ️ Pajak Penghasilan Negara: ${countryData.taxes.income}%`);
    }
    return notes;
  })();

  const productionDisplay = productionValue !== null ? `${productionValue.toFixed(2)} di gudang` : '—';
  
  const locationText = (() => {
    const regionLabel = regionData?.displayName || regionData?.name || regionData?.code || regionData?.regionName || null;
    const regionCode = regionData?.code || regionLabel || comp?.region || null;
    const countryName = countryData?.name || regionData?.countryData?.name || regionData?.countryName || null;
    const countryCode = countryData?.code?.toUpperCase?.() || regionData?.countryData?.code?.toUpperCase?.() || null;
    const depositType = regionData?.deposit?.type || regionData?.depositType || null;
    const depositBonus = regionData?.deposit?.bonusPercent ?? regionData?.bonusPercent ?? null;
    const taxRate = countryData?.taxes?.income ?? countryData?.incomeTax ?? null;

    const parts = [];
    if (regionCode) parts.push(regionCode);
    if (countryName) parts.push(countryName);
    if (countryCode) parts.push(`(${countryCode})`);

    const summary = parts.join(' · ');
    const detailParts = [];
    if (taxRate !== undefined && taxRate !== null) detailParts.push(`${Number(taxRate).toFixed(0)}% Income Tax`);
    if (depositType) {
      const bonusText = depositBonus !== undefined && depositBonus !== null ? `${Number(depositBonus).toFixed(0)}%` : 'bonus';
      detailParts.push(`Bonus +${bonusText} deposit (${depositType})`);
    }

    if (summary) {
      return detailParts.length ? `${summary}\n${detailParts.join(' · ')}` : summary;
    }
    return comp?.region ? 'Membaca detail lokasi...' : '—';
  })();

  return (
    <div className="bg-[#10121A]/80 border border-slate-800 hover:border-slate-700/80 rounded-xl overflow-hidden transition duration-200">
      
      {/* CLICKABLE HEADER */}
      <div 
        onClick={onToggle} 
        className="flex items-center gap-4.5 p-4 cursor-pointer select-none"
      >
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex items-center justify-center shrink-0">
          <ItemIcon itemCode={comp?.itemCode} size="md" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1 xs:gap-4 pr-2">
            <span className="font-bold text-sm text-white truncate">
              {comp?.name || 'Pabrik Tanpa Nama'}
            </span>
            <span className={`text-xs font-bold font-mono shrink-0 ${totalEfficiency === null ? 'text-slate-500' : totalEfficiency >= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {productionDisplay}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="uppercase font-bold text-slate-400">{comp?.itemCode || 'Komoditas'}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-slate-600" />
              Engine Lv {aeLevel} {ppPerDay ? `(${ppPerDay} PP)` : ''}
            </span>
          </div>
        </div>

        {comp?.isFull && (
          <span className="text-[10px] font-bold text-rose-400 bg-rose-950/20 px-2 py-0.5 border border-rose-900/30 rounded">
            FULL
          </span>
        )}

        <ChevronDown className={`w-4 h-4 text-slate-500 transition duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* DROPDOWN DETAILS */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-800/60 pt-4 bg-[#0a0c10]/40 space-y-4">
          
          {/* LOKASI & STORAGE BAR */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* LOKASI */}
            <div className="bg-[#090A0E] border border-slate-800/80 p-3.5 rounded-lg flex items-start gap-3">
              <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Yurisdiksi & Lokasi Geopolitik
                </span>
                <p className="text-xs text-slate-300 font-medium whitespace-pre-line leading-relaxed">
                  {locationText}
                </p>
                {productionBonus && (
                  <div className="text-[10px] text-emerald-500 mt-2 space-y-0.5 border-t border-slate-900 pt-2 font-mono">
                    {breakdownNotes.map((note, i) => <div key={i}>{note}</div>)}
                  </div>
                )}
              </div>
            </div>

            {/* STORAGE */}
            <div className="bg-[#090A0E] border border-slate-800/80 p-3.5 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  <span>Penyimpanan (Storage Lv {storageLevel})</span>
                  <span className="font-mono text-slate-400">{currentProduction.toFixed(2)} / {maxStorage}</span>
                </div>
                
                {/* Progress bar container */}
                <div className="w-full bg-[#1e293b]/30 h-2.5 rounded-full overflow-hidden border border-slate-900">
                  <div 
                    className={`${barColor} h-full transition-all duration-300 rounded-full`} 
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="text-[10px] text-slate-500 flex justify-between items-center mt-3">
                <span>Stok Gudang saat ini</span>
                <span>{progressPercent.toFixed(1)}% Terisi</span>
              </div>
            </div>

          </div>

          {/* ENGINE, WORKERS, SUMMARY (DYNAMIC CALC) */}
          {(() => {
            const rawMarketData = marketPrices[comp?.itemCode];
            const realPrice = typeof rawMarketData === 'number'
              ? rawMarketData
              : (rawMarketData?.avg ?? rawMarketData?.price ?? rawMarketData?.value ?? 0);

            const basePP = ppPerDay || 0;
            const bonusPercent = productionBonus?.total || 0;
            const enginePPWithBonus = basePP * (1 + (bonusPercent / 100));

            const activeWorkers = Array.isArray(workers) ? workers : [];
            const workerCount = activeWorkers.length || comp?.workerCount || 0;
            const workerBreakdowns = activeWorkers.map((w) => ({
              ...w,
              ...calculateWorkerDailyOutput({
                energyMax: w?.energyValue || 0,
                productionValue: w?.productionValue || 0,
                wagePerPP: w?.wage || 0,
                fidelity: w?.fidelity || 0,
                companyBonusPercent: bonusPercent,
              }),
            }));

            const workersBoostedPPPerDay = workerBreakdowns.reduce((sum, w) => sum + w.boostedPPPerDay, 0);
            const workersWagePerDay = workerBreakdowns.reduce((sum, w) => sum + w.wagePerDay, 0);
            const totalPP = enginePPWithBonus + workersBoostedPPPerDay;

            const ppPerUnit = itemsConfig?.[comp?.itemCode]?.productionPoints || 1;
            const dailyProduction = ppPerUnit > 0 ? (totalPP || 0) / ppPerUnit : 0;

            const itemPrice = realPrice > 0
              ? realPrice
              : (comp?.estimatedValue > 0 && dailyProduction > 0 ? (comp.estimatedValue / dailyProduction) : 0);

            const grossRevenue = dailyProduction * itemPrice;
            const upkeep = workersWagePerDay;
            const netProfit = grossRevenue - upkeep;

            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* COLUMN 1: AUTOMATED ENGINE */}
                <div className="bg-[#090A0E] border border-slate-800/60 p-3.5 rounded-lg">
                  <div className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-1.5 border-b border-slate-900 pb-2">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    Automated Engine (Lv {aeLevel})
                  </div>
                  <DetailRow label="Base Engine PP" value={`${basePP.toFixed(1)} PP`} />
                  <DetailRow label="Region Bonus" value={`+${bonusPercent.toFixed(1)}%`} valueColor="text-emerald-400" />
                  <div className="border-t border-slate-900 my-2"></div>
                  <DetailRow label="Engine Output" value={`${enginePPWithBonus.toFixed(1)} PP/day`} isBold={true} />
                </div>

                {/* COLUMN 2: WORKERS */}
                <div className="bg-[#090A0E] border border-slate-800/60 p-3.5 rounded-lg flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-1.5 border-b border-slate-900 pb-2">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      Workers Hired ({workerCount})
                    </div>
                    {workerBreakdowns.length === 0 ? (
                      <span className="block text-[11px] text-slate-500 italic mt-2">
                        Butuh API Token untuk memetakan pekerja aktif dan menghitung upah.
                      </span>
                    ) : (
                      <div className="space-y-2 max-h-[85px] overflow-y-auto pr-1">
                        {workerBreakdowns.map((w, i) => (
                          <div key={w._id || i} className="text-[10.5px] border-b border-slate-900/55 pb-1 last:border-0">
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-mono">Buruh #{i+1}</span>
                              <span className="text-emerald-400 font-bold font-mono">+{w.boostedPPPerDay.toFixed(1)} PP</span>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-500">
                              <span>Wage/day</span>
                              <span className="text-rose-400">-${w.wagePerDay.toFixed(3)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {workerBreakdowns.length > 0 && (
                    <div className="pt-2 border-t border-slate-900 mt-2">
                      <DetailRow label="Total Worker PP" value={`${workersBoostedPPPerDay.toFixed(1)} PP`} isBold={true} />
                    </div>
                  )}
                </div>

                {/* COLUMN 3: DAILY SUMMARY */}
                <div className="bg-[#090A0E] border border-slate-800/60 p-3.5 rounded-lg">
                  <div className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-1.5 border-b border-slate-900 pb-2">
                    <TrendingUp className="w-3.5 h-3.5 text-[#e67e22]" />
                    Ringkasan Finansial Harian
                  </div>
                  <DetailRow label="Daily PP" value={`${totalPP.toFixed(1)} PP`} />
                  <DetailRow label="Yield" value={`${dailyProduction.toFixed(1)}u / day`} />
                  <DetailRow label="Market Price" value={`${itemPrice.toFixed(3)} cc`} />
                  <div className="border-t border-slate-900 my-2"></div>
                  <DetailRow label="Revenue" value={`+${grossRevenue.toFixed(3)} cc`} valueColor="text-emerald-400" />
                  <DetailRow label="Wage Upkeep" value={`-${upkeep.toFixed(3)} cc`} valueColor="text-rose-400" />
                  <div className="border-t border-slate-900 my-1.5"></div>
                  <DetailRow 
                    label="Profit / day" 
                    value={`${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(3)} cc`} 
                    valueColor={netProfit >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}
                    isBold={true}
                  />
                </div>

              </div>
            );
          })()}

        </div>
      )}

    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  valueColor?: string;
  isBold?: boolean;
}

function DetailRow({ label, value, valueColor = 'text-slate-200', isBold = false }: DetailRowProps) {
  return (
    <div className="flex justify-between items-center text-[11px] py-1">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono ${isBold ? 'font-bold' : ''} ${valueColor}`}>{value}</span>
    </div>
  );
}