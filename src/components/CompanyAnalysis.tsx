import React, { useState, useEffect, useMemo } from 'react';
import { getCompaniesByUserId, getProductionBonus, getWorkersByUserId, getUserEcoSkills, getGameConfig, fetchWarera } from '../api/apiClient';
import { AE_PP_PER_DAY, calculateWorkerDailyOutput, computeCompanyDailyProduction } from './production';
import { Cpu, Users, Percent, MapPin, Coins, Building2, TrendingUp, ChevronDown, RefreshCw, AlertCircle, Package, Wallet, Landmark, Sword, Shirt, PowerOff } from 'lucide-react';
import ItemIcon from './ItemIcon';
import CurrencyIcon from './CurrencyIcon';
import { GAME_ITEMS } from '../data/gameConfig';

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
        Rincian Kekayaan 
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {rows.map(({ key, label, icon: Icon, value }) => (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <Icon className="w-3 h-3" />
              {label}
            </div>
            <div className="text-sm font-bold font-mono text-slate-200 flex items-center gap-1">{formatMoney(value)} <CurrencyIcon /></div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-800 mt-3 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
          <Wallet className="w-3.5 h-3.5" />
          Total Kekayaan
        </div>
        <div className="text-lg font-black font-mono text-emerald-400 flex items-center gap-1">{formatMoney(total)} <CurrencyIcon className="w-4 h-4 inline-block align-[-3px]" /></div>
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
  const [entrepreneurshipLevel, setEntrepreneurshipLevel] = useState<number>(() => {
    const saved = localStorage.getItem('warera_entrepreneurship');
    const num = Number(saved);
    return Number.isFinite(num) && num > 0 ? num : 0;
  });
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [marketPrices, setMarketPrices] = useState<Record<string, any>>({});
  const [itemsConfig, setItemsConfig] = useState<Record<string, any>>(() => ({ ...GAME_ITEMS }));

  // Per-company: bahan mentah memakai supply internal MFG atau dibeli dari market.
  const internalSupplyStorageKey = `warera_internal_mfg_${userId || 'anon'}`;
  const [internalSupplyIds, setInternalSupplyIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(internalSupplyStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(internalSupplyStorageKey, JSON.stringify(internalSupplyIds));
    } catch {
      /* ignore quota errors */
    }
  }, [internalSupplyIds, internalSupplyStorageKey]);

  const toggleInternalSupply = (companyId: string) => {
    setInternalSupplyIds((prev) => ({ ...prev, [companyId]: !prev[companyId] }));
  };

  // Company mana yang di-flag "selalu jual ke market" (jangan ikut dialokasikan
  // sebagai bahan baku internal ke company lain). Preferensi user, bukan dari
  // API — disimpan per-userId di localStorage supaya persist antar sesi.
  const excludeStorageKey = `warera_exclude_internal_${userId || 'anon'}`;
  const [excludedIds, setExcludedIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(excludeStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(excludeStorageKey, JSON.stringify(excludedIds));
    } catch {
      /* ignore quota errors */
    }
  }, [excludedIds, excludeStorageKey]);

  const toggleExcludeFromInternal = (companyId: string) => {
    setExcludedIds((prev) => ({ ...prev, [companyId]: !prev[companyId] }));
  };

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
      const apiItems = cfgRes?.success ? cfgRes.data?.items : null;
      setItemsConfig((prev) => ({
        ...GAME_ITEMS,
        ...(apiItems && typeof apiItems === 'object' ? apiItems : {}),
      }));
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
          acc[uid] = skillsResults[index]?.data || { energyValue: 0, productionValue: 0, entrepreneurshipValue: 0, username: '', avatarUrl: '' };
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

  // Hitung dailyProduction SEMUA company sekaligus (dipakai bareng buat pool
  // alokasi internal), lalu bangun pool per itemCode (exclude company yang
  // di-flag "selalu jual ke market"), lalu hitung Used Internally / Sold /
  // Material Cost per company.
  const financialsByCompanyId = useMemo(() => {
    type CompanyProdResult = { companyId: string } & ReturnType<typeof computeCompanyDailyProduction>;

    const results: CompanyProdResult[] = companies
      .filter((c: any) => c?._id)
      .map((c: any) => ({
        companyId: c._id as string,
        ...computeCompanyDailyProduction({
          comp: c,
          productionBonus: productionBonusDict[c._id],
          workers: workersByCompanyId[c._id] || [],
          itemsConfig,
          entrepreneurshipPP: entrepreneurshipLevel,
        }),
      }));

    // Raw material pool hanya berasal dari company yang boleh memasok internal.
    const pool: Record<string, number> = {};
    // Hanya consumer dengan Supply Internal MFG ON yang mengambil dari pool.
    const consumedTotal: Record<string, number> = {};

    results.forEach((r: CompanyProdResult) => {
      if (!excludedIds[r.companyId]) {
        pool[r.itemCode] = (pool[r.itemCode] || 0) + r.dailyProduction;
      }

      if (internalSupplyIds[r.companyId] !== false && r.productionNeeds) {
        Object.entries(r.productionNeeds as Record<string, number>).forEach(([rawCode, ratio]) => {
          consumedTotal[rawCode] = (consumedTotal[rawCode] || 0) + r.dailyProduction * ratio;
        });
      }
    });

    const priceOf = (code: string) => {
      const raw = marketPrices[code];
      return typeof raw === 'number' ? raw : (raw?.avg ?? raw?.price ?? raw?.value ?? 0);
    };

    // Estimasi weighted internal production cost per item. Dimulai dari harga
    // market lalu diperkaya beberapa pass agar rantai MFG (raw -> intermediate -> finished)
    // ikut membawa biaya produksi internal, bukan dianggap gratis.
    let internalUnitCost: Record<string, number> = {};
    results.forEach((r: CompanyProdResult) => {
      if (r.dailyProduction > 0) {
        internalUnitCost[r.itemCode] = priceOf(r.itemCode);
      }
    });

    for (let pass = 0; pass < 5; pass += 1) {
      const weighted: Record<string, { qty: number; cost: number }> = {};
      results.forEach((r: CompanyProdResult) => {
        if (excludedIds[r.companyId] || r.dailyProduction <= 0) return;

        let materialCost = 0;
        if (r.productionNeeds) {
          Object.entries(r.productionNeeds as Record<string, number>).forEach(([rawCode, ratio]) => {
            const qty = r.dailyProduction * ratio;
            const marketPrice = priceOf(rawCode);
            const sourceCost = internalUnitCost[rawCode] ?? marketPrice;
            const availablePool = pool[rawCode] || 0;
            const totalNeed = consumedTotal[rawCode] || 0;
            const internalAvailable = Math.min(availablePool, totalNeed);
            const internalQty = internalSupplyIds[r.companyId] && totalNeed > 0
              ? Math.min(qty, internalAvailable * (qty / totalNeed))
              : 0;
            materialCost += internalQty * sourceCost + Math.max(0, qty - internalQty) * marketPrice;
          });
        }

        const totalCost = (r.workersWagePerDay || 0) + materialCost;
        const bucket = weighted[r.itemCode] || { qty: 0, cost: 0 };
        bucket.qty += r.dailyProduction;
        bucket.cost += totalCost;
        weighted[r.itemCode] = bucket;
      });

      Object.entries(weighted).forEach(([itemCode, v]) => {
        if (v.qty > 0) internalUnitCost[itemCode] = v.cost / v.qty;
      });
    }

    const byId: Record<string, any> = {};
    results.forEach((r: CompanyProdResult) => {
      const poolProduced = pool[r.itemCode] || 0;
      const totalConsumed = consumedTotal[r.itemCode] || 0;
      const internalUsedTotal = Math.min(poolProduced, totalConsumed);
      const share = poolProduced > 0 ? r.dailyProduction / poolProduced : 0;

      const usedInternallyQty = excludedIds[r.companyId] ? 0 : internalUsedTotal * share;
      const soldQty = r.dailyProduction - usedInternallyQty;

      let materialBreakdown: {
        itemCode: string;
        qty: number;
        internalQty: number;
        marketQty: number;
        cost: number;
        marketPrice: number;
      }[] = [];

      if (r.productionNeeds) {
        materialBreakdown = Object.entries(r.productionNeeds as Record<string, number>).map(([rawCode, ratio]) => {
          const qty = r.dailyProduction * ratio;
          const marketPrice = priceOf(rawCode);

          // OFF = semua bahan dari market.
          // ON = ambil supply internal yang tersedia, sisanya market.
          let internalQty = 0;
          if (internalSupplyIds[r.companyId] !== false) {
            const rawPoolProduced = pool[rawCode] || 0;
            const rawTotalConsumed = consumedTotal[rawCode] || 0;
            const totalInternalAvailable = Math.min(rawPoolProduced, rawTotalConsumed);
            const consumerShare = rawTotalConsumed > 0 ? qty / rawTotalConsumed : 0;
            internalQty = Math.min(qty, totalInternalAvailable * consumerShare);
          }

          const marketQty = Math.max(0, qty - internalQty);
          const internalPrice = internalUnitCost[rawCode] ?? marketPrice;
          return {
            itemCode: rawCode,
            qty,
            internalQty,
            marketQty,
            cost: internalQty * internalPrice + marketQty * marketPrice,
            marketPrice,
            internalPrice,
          };
        });
      }

      const materialCost = materialBreakdown.reduce((s, m) => s + m.cost, 0);

      byId[r.companyId] = {
        dailyProduction: r.dailyProduction,
        soldQty,
        usedInternallyQty,
        materialBreakdown,
        materialCost,
        itemType: r.itemType,
        supplyInternalMfg: internalSupplyIds[r.companyId] !== false,
      };
    });

    return byId;
  }, [
    companies,
    productionBonusDict,
    workersByCompanyId,
    itemsConfig,
    excludedIds,
    internalSupplyIds,
    marketPrices,
  ]);

  return (
    <div className="animate-fade-in text-slate-200">
      
      {/* HEADER CONTROLS */}
      <div className="flex justify-between items-center gap-3 mb-4 pb-2 border-b border-slate-800 flex-wrap">
        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
          {data?.playerData?.username ? `Pemain: ${data.playerData.username}` : 'Company Analysis'}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-slate-400" title="PP/day tambahan dari skill Entrepreneurship, ditambahkan ke Total PP. Diisi manual.">
            <span className="uppercase tracking-wider text-[10px] font-bold">Entrepreneurship PP</span>
            <input
              type="number"
              min={0}
              value={entrepreneurshipLevel}
              onChange={(e) => {
                const num = Number(e.target.value);
                setEntrepreneurshipLevel(Number.isFinite(num) ? num : 0);
                localStorage.setItem('warera_entrepreneurship', String(num));
              }}
              className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-center outline-none focus:border-indigo-500"
            />
          </label>
          <button 
            onClick={handleAnalyse} 
            disabled={isLoading} 
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[#e67e22] hover:text-[#f39c12] text-xs font-bold px-3 py-1.5 rounded-lg transition duration-200 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'MEMUAT...' : 'Refresh'}
          </button>
        </div>
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
                entrepreneurshipLevel={entrepreneurshipLevel}
                workers={comp?._id ? (workersByCompanyId[comp._id] || []) : []}
                isExpanded={expandedId === id}
                onToggle={() => setExpandedId(prev => prev === id ? null : id)}
                marketPrices={marketPrices}
                itemsConfig={itemsConfig}
                companyFinancials={comp?._id ? financialsByCompanyId[comp._id] : undefined}
                excludedFromInternal={comp?._id ? !!excludedIds[comp._id] : false}
                onToggleExcludeFromInternal={() => comp?._id && toggleExcludeFromInternal(comp._id)}
                supplyInternalMfg={comp?._id ? internalSupplyIds[comp._id] !== false : true}
                onToggleInternalSupply={() => comp?._id && toggleInternalSupply(comp._id)}
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

function CompanyListItem({
  comp,
  regionsDict,
  productionBonus,
  entrepreneurshipLevel = 0,
  isExpanded,
  onToggle,
  marketPrices,
  workers = [],
  itemsConfig = {},
  companyFinancials,
  excludedFromInternal,
  onToggleExcludeFromInternal,
  supplyInternalMfg,
  onToggleInternalSupply,
}: any) {
  const isDisabled = Boolean(comp?.disabledAt || comp?.isDisabled || comp?.disabled);

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

  const productionDisplay = isDisabled ? '0 (DIMATIKAN)' : productionValue !== null ? `${productionValue.toFixed(2)} di gudang` : '—';
  
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
    <div className={`border rounded-xl overflow-hidden transition duration-200 ${isDisabled ? 'bg-[#10121A]/50 border-rose-900/30 opacity-80' : 'bg-[#10121A]/80 border-slate-800 hover:border-slate-700/80'}`}>
      
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
            <span className="font-bold text-sm text-white truncate flex items-center gap-2">
              {comp?.name || 'Pabrik Tanpa Nama'}
            </span>
            <span className={`text-xs font-bold font-mono shrink-0 ${isDisabled ? 'text-rose-400' : totalEfficiency === null ? 'text-slate-500' : totalEfficiency >= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {productionDisplay}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="uppercase font-bold text-slate-400">
              {(comp?.itemCode ? (GAME_ITEMS[comp.itemCode] || GAME_ITEMS[comp.itemCode.toLowerCase()])?.name : null) || comp?.itemCode || 'Komoditas'}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-slate-600" />
              Engine Lv {aeLevel} {ppPerDay ? `(${ppPerDay} PP)` : ''}
            </span>
          </div>
        </div>

        {isDisabled ? (
          <span className="text-[10px] font-bold text-rose-400 bg-rose-950/40 px-2 py-0.5 border border-rose-900/50 rounded flex items-center gap-1 shrink-0">
            <PowerOff className="w-3 h-3" /> DIMATIKAN
          </span>
        ) : comp?.isFull ? (
          <span className="text-[10px] font-bold text-rose-400 bg-rose-950/20 px-2 py-0.5 border border-rose-900/30 rounded shrink-0">
            FULL
          </span>
        ) : null}

        <ChevronDown className={`w-4 h-4 text-slate-500 transition duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* DROPDOWN DETAILS */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-800/60 pt-4 bg-[#0a0c10]/40 space-y-4">
          
          {isDisabled && (
            <div className="bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs p-3 rounded-lg flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <span className="font-bold">Company ini sedang DIMATIKAN (disabledAt).</span>
                <p className="text-[11px] text-rose-300/80 mt-0.5">
                  Produksi harian dihentikan (0 PP) dan perusahaan ini tidak diikutsertakan dalam alokasi bahan baku internal maupun perhitungan finansial rantai pasok.
                </p>
              </div>
            </div>
          )}
          
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
            const entPP = isDisabled ? 0 : (Number(entrepreneurshipLevel) || 0);
            const totalPP = enginePPWithBonus + workersBoostedPPPerDay + entPP;

            const ppPerUnit = itemsConfig?.[comp?.itemCode]?.productionPoints || 1;
            const dailyProduction = ppPerUnit > 0 ? (totalPP || 0) / ppPerUnit : 0;

            const itemPrice = realPrice > 0
              ? realPrice
              : (comp?.estimatedValue > 0 && dailyProduction > 0 ? (comp.estimatedValue / dailyProduction) : 0);

            // Pakai hasil alokasi lintas-company (soldQty/materialCost) kalau sudah
            // ada, supaya Revenue cuma menghitung porsi yang BENAR2 terjual (bukan
            // yang dipakai company lain sebagai bahan baku), dan Material Costs
            // masuk sebagai biaya buat company produk. Fallback ke dailyProduction
            // penuh selagi companyFinancials belum siap (masih loading).
            const soldQty = companyFinancials?.soldQty ?? dailyProduction;
            const usedInternallyQty = companyFinancials?.usedInternallyQty ?? 0;
            const materialBreakdown = companyFinancials?.materialBreakdown ?? [];
            const materialCost = companyFinancials?.materialCost ?? 0;

            const grossRevenue = soldQty * itemPrice;
            const upkeep = workersWagePerDay + materialCost;
            const netProfit = grossRevenue - upkeep;

            // Tampilkan jumlah unit dengan pembulatan ke bawah supaya konsisten
            // (produksi 5.76 -> 5 Fish), dan hitung revenue/profit dari unit bulat
            // itu agar baris "N units × harga = +X" selalu akurat.
            const floorQty = (q: number) => Math.max(0, Math.floor(q));
            const shownDailyProduction = floorQty(dailyProduction);
            const shownUsedInternallyQty = floorQty(usedInternallyQty);
            const shownSoldQty = floorQty(soldQty);
            const shownGrossRevenue = shownSoldQty * itemPrice;
            // At-cost refund dari pabrik: unit yang dipasok internal dibayar sebesar
            // biaya produksinya (upah per unit), bukan harga market. Jadi saat produksi
            // dijadikan bahan baku pabrik, uang tidak "hilang" dan net profit berubah.
            const rawUnitCost = dailyProduction > 0 ? workersWagePerDay / dailyProduction : 0;
            const mfgRefund = shownUsedInternallyQty > 0 ? shownUsedInternallyQty * rawUnitCost : 0;
            const shownNetProfit = shownGrossRevenue - upkeep + mfgRefund;

            const isRawCompany = itemsConfig?.[comp?.itemCode]?.type === 'raw';
            const itemConfig = itemsConfig?.[comp?.itemCode] || GAME_ITEMS[comp?.itemCode];
            const itemName = itemConfig?.name || comp?.itemCode || '';

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
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {workerBreakdowns.map((w, i) => {
                          const workerName = w?.username || w?.user?.username || w?.user?.name || `Buruh #${i + 1}`;
                          const avatarUrl = w?.avatarUrl || w?.user?.avatarUrl || w?.user?.avatar || '';
                          return (
                            <div key={w._id || i} className="flex items-center gap-2.5 border-b border-slate-900/55 pb-2 last:border-0">
                              {avatarUrl ? (
                                <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full border border-slate-700 object-cover shrink-0" loading="lazy" />
                              ) : (
                                <div className="w-9 h-9 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                                  {workerName.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex justify-between gap-2 items-center">
                                  <span className="text-slate-200 font-medium truncate">{workerName}</span>
                                  <span className="text-emerald-400 font-bold font-mono whitespace-nowrap">+{w.boostedPPPerDay.toFixed(1)} PP</span>
                                </div>
                                <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
                                  <span>Wage/day</span>
                                  <span className="text-rose-400 font-mono">-${w.wagePerDay.toFixed(3)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {workerBreakdowns.length > 0 && (
                    <div className="pt-2 border-t border-slate-900 mt-2">
                      <DetailRow label="Total Worker PP" value={`${workersBoostedPPPerDay.toFixed(1)} PP`} isBold={true} />
                      <DetailRow label="Total Wage/day" value={<>-${workersWagePerDay.toFixed(3)}</>} valueColor="text-rose-400" />
                    </div>
                  )}
                </div>

                {/* COLUMN 3: DAILY SUMMARY */}
                <div className="bg-[#090A0E] border border-slate-800/60 p-3.5 rounded-lg">
                  <div className="text-xs font-bold text-slate-300 mb-3 flex items-center justify-between border-b border-slate-900 pb-2">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-[#e67e22]" />
                      Ringkasan Finansial Harian
                    </span>
                  </div>
                  {isRawCompany ? (
                    <>
                      <label
                        className="flex items-center justify-between gap-2 mb-2 py-1.5 px-2 bg-slate-900/40 border border-slate-800/60 rounded cursor-pointer select-none"
                        title="Centang: hasil produksi dipakai sebagai bahan baku pabrik internal (supply ke pabrik). Tidak dicentang: seluruh produksi dihitung terjual ke market."
                      >
                        <span className="leading-tight">
                          <span className="block text-[10px] text-slate-300 font-medium">Supply ke pabrik</span>
                          <span className="block text-[8.5px] text-slate-500 mt-0.5">
                            {excludedFromInternal
                              ? 'Seluruh produksi dihitung terjual ke market'
                              : 'Produksi dipakai untuk bahan baku pabrik internal'}
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={!excludedFromInternal}
                          onChange={onToggleExcludeFromInternal}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-indigo-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                        />
                      </label>

                      <DetailRow label="Total PP / day" value={`${totalPP.toFixed(2)} PP`} />
                      <DetailRow label="Entrepreneurship PP" value={entPP > 0 ? `+${entPP} PP` : '0 PP'} valueColor={entPP > 0 ? 'text-[#f5c542]' : undefined} />

                      {excludedFromInternal ? (
                        <>
                          <DetailRow label="Units produced" value={`${shownDailyProduction} ${itemName}`} />
                          <DetailRow label="Market price / unit" value={<>{itemPrice.toFixed(3)} <CurrencyIcon /></>} />
                          <DetailRow label="Revenue" value={<>+{shownGrossRevenue.toFixed(3)} <CurrencyIcon /></>} valueColor="text-emerald-400" />
                        </>
                      ) : (
                        <>
                          <DetailRow label="Production" value={`${shownDailyProduction} ${itemName}/day`} />
                          {shownUsedInternallyQty > 0 && (
                            <DetailRow
                              label="→ Supplied to MFG (at-cost)"
                              value={`${shownUsedInternallyQty} units`}
                              valueColor="text-amber-400"
                            />
                          )}
                          {mfgRefund > 0.0001 && (
                            <DetailRow
                              label="→ MFG at-cost refund"
                              value={<>+{mfgRefund.toFixed(3)} <CurrencyIcon /></>}
                              valueColor="text-emerald-400"
                            />
                          )}
                        </>
                      )}

                      <DetailRow label="Wage Costs" value={<>-{workersWagePerDay.toFixed(3)} <CurrencyIcon /></>} valueColor="text-rose-400" />
                      <div className="border-t border-slate-900 my-1.5"></div>
                      <DetailRow
                        label="Net Profit / day"
                        value={<>{shownNetProfit >= 0 ? '+' : ''}{shownNetProfit.toFixed(3)} <CurrencyIcon /></>}
                        valueColor={shownNetProfit >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}
                        isBold={true}
                      />
                    </>
                  ) : (
                    <>
                      <DetailRow label="Total PP / day" value={`${totalPP.toFixed(1)} PP`} />
                      <DetailRow label="Entrepreneurship PP" value={entPP > 0 ? `+${entPP} PP` : '0 PP'} valueColor={entPP > 0 ? 'text-[#f5c542]' : undefined} />
                      <DetailRow label="Units produced" value={`${shownDailyProduction} ${itemName}`} />
                      <DetailRow label="Market price / unit" value={<>{itemPrice.toFixed(3)} <CurrencyIcon /></>} />

                      {/* Finished goods: pilih supply internal atau market. */}
                      {Array.isArray(materialBreakdown) && materialBreakdown.length > 0 && (
                        <label
                          className="flex items-center justify-between gap-2 mt-2 py-1.5 px-2 bg-slate-900/40 border border-slate-800/60 rounded cursor-pointer select-none"
                          title="ON: gunakan hasil produksi bahan mentah sendiri sebagai input bila tersedia. OFF: seluruh bahan mentah dihitung memakai harga market."
                        >
                          <span className="leading-tight">
                            <span className="block text-[10px] text-slate-300 font-medium">Supply Internal MFG</span>
                            <span className="block text-[8.5px] text-slate-500 mt-0.5">
                              {supplyInternalMfg ? 'Gunakan bahan mentah internal bila tersedia' : 'Beli bahan mentah dari market'}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            checked={!!supplyInternalMfg}
                            onChange={onToggleInternalSupply}
                            onClick={(e) => e.stopPropagation()}
                            className="accent-indigo-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                          />
                        </label>
                      )}

                      {shownUsedInternallyQty > 0 && (
                        <DetailRow label="Untuk Produksi" value={`-${shownUsedInternallyQty}/day`} valueColor="text-amber-400" />
                      )}

                      <div className="border-t border-slate-900 my-2"></div>
                      <DetailRow label="Revenue" value={<>+{shownGrossRevenue.toFixed(3)} <CurrencyIcon /></>} valueColor="text-emerald-400" />
                      <DetailRow label="Wage costs" value={<>-{workersWagePerDay.toFixed(3)} <CurrencyIcon /></>} valueColor="text-rose-400" />

                      {materialBreakdown.length > 0 && (
                        <>
                          <DetailRow label="Material Costs" value={<>-{materialCost.toFixed(3)} <CurrencyIcon /></>} valueColor="text-rose-400" />
                          <div className="mt-1 mb-1 px-2 py-1.5 rounded bg-slate-900/30 border border-slate-900/70">
                            <div className="text-[9px] uppercase tracking-wide text-slate-600 mb-1">Raw Material</div>
                            {materialBreakdown.map((m: any) => (
                              <div key={m.itemCode} className="py-1 border-b border-slate-900/60 last:border-0">
                                <div className="flex justify-between gap-2 text-[10px]">
                                  <span className="text-slate-400 truncate">
                                    {(m.itemCode ? (GAME_ITEMS[m.itemCode] || GAME_ITEMS[m.itemCode.toLowerCase()])?.name : null) || m.itemCode}
                                  </span>
                                  <span className="text-slate-500 font-mono whitespace-nowrap">{m.qty.toFixed(1)}u</span>
                                </div>
                                <div className="flex flex-wrap gap-x-2 text-[8.5px] text-slate-600 mt-0.5">
                                  <span>Market: {m.marketPrice.toFixed(3)}</span>
                                  <span>Internal cost: {m.internalPrice.toFixed(3)}</span>
                                  <span>Internal qty: {m.internalQty.toFixed(1)}</span>
                                  <span>Market qty: {m.marketQty.toFixed(1)}</span>
                                  {m.internalQty > 0.001 && <span className="text-emerald-500">✓ Using Internal Supply</span>}
                                </div>
                                <div className="flex justify-end text-[9px]">
                                  <span className={m.cost > 0.001 ? 'text-rose-400 font-mono' : 'text-emerald-400 font-mono'}>
                                    {m.cost > 0.001 ? `-${m.cost.toFixed(3)}` : 'Free'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="border-t border-slate-900 my-1.5"></div>
                      <DetailRow 
                        label="Net Profit / day" 
                        value={<>{shownNetProfit >= 0 ? '+' : ''}{shownNetProfit.toFixed(3)} <CurrencyIcon /></>} 
                        valueColor={shownNetProfit >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}
                        isBold={true}
                      />
                    </>
                  )}
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
  value: React.ReactNode;
  valueColor?: string;
  isBold?: boolean;
}

function DetailRow({ label, value, valueColor = 'text-slate-200', isBold = false }: DetailRowProps) {
  return (
    <div className="flex justify-between items-center text-[11px] py-1">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono flex items-center gap-1 ${isBold ? 'font-bold' : ''} ${valueColor}`}>{value}</span>
    </div>
  );
}