import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  UserRound, SlidersHorizontal, Shield, Target, RefreshCw, Check, Wand2,
  Zap, Loader2, Sparkles, Download, ArrowRight, Swords, HardHat, Shirt,
  Footprints, Hand, Boxes, Beef, Pill, AlertTriangle, Info,
} from 'lucide-react';
import { getUserCombatProfile, getItemPrices } from '../api/apiClient';
import ItemIcon from './ItemIcon';
import CurrencyIcon from './CurrencyIcon';
import { formatPrice } from '../utils/priceHelper';
import {
  COMBAT_SKILLS, MAX_SKILL_LEVEL, DEFAULT_POINTS_PER_LEVEL,
  skillValue, skillTotalCost, clampLevel,
  buildGearOptions, computeCombatStats, optimizeSkills, generateBuilds,
  emptySkillLevels, sumSkillCost, fmtNum, DEFAULT_SETTINGS, GEAR_SLOTS, SLOT_LABEL,
  STAT_LABELS, ECONOMIC_SKILLS, emptyEconomicSkillLevels,
  simulateCombat, DEFAULT_SIM_SETTINGS,
} from '../data/combatConfig';
import type {
  CombatSkillKey, GearSlot, GearPiece, UnitGear, CombatSettings,
  OptimizeObjective, BuildObjective, BuildCandidate, CombatStats, GearStatKey,
  EconomicSkillKey, SimSettings, SimResult,
} from '../data/combatConfig';

interface CombatUnitOptimizerProps {
  userId?: string;
  token?: string | null;
}

const SLOT_ICONS: Record<GearSlot, React.ReactNode> = {
  weapon: <Swords className="w-3.5 h-3.5" />,
  helmet: <HardHat className="w-3.5 h-3.5" />,
  chest: <Shield className="w-3.5 h-3.5" />,
  pants: <Shirt className="w-3.5 h-3.5" />,
  boots: <Footprints className="w-3.5 h-3.5" />,
  gloves: <Hand className="w-3.5 h-3.5" />,
  ammo: <Boxes className="w-3.5 h-3.5" />,
  food: <Beef className="w-3.5 h-3.5" />,
  pill: <Pill className="w-3.5 h-3.5" />,
};

const inputCls =
  'w-full bg-[#08090C] text-slate-200 border border-slate-800 hover:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-emerald-500/60 transition duration-150';
const selectCls =
  'w-full bg-[#08090C] text-slate-200 border border-slate-800 hover:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-semibold outline-none focus:border-emerald-500/60 transition duration-150 cursor-pointer';

const RARITY_COLORS: Record<string, string> = {
  common: 'text-slate-400',
  uncommon: 'text-emerald-400',
  rare: 'text-sky-400',
  epic: 'text-purple-400',
  legendary: 'text-yellow-400',
  mythic: 'text-rose-400',
};

function rarityColor(rarity?: string): string {
  return RARITY_COLORS[rarity ?? 'common'] ?? 'text-slate-400';
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function Card({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`bg-[#0C0D13] border border-slate-800/60 rounded-xl p-4 md:p-5 ${className}`}>
      {children}
    </div>
  );
}

function StepHeader({
  step,
  title,
  subtitle,
  icon,
}: {
  step: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span className="text-emerald-500 font-mono">0{step}</span> {title}
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  hint,
  accent = 'text-white',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#0C0D13] border border-slate-800/60 rounded-xl px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className={`text-sm font-mono font-bold mt-0.5 ${accent}`}>{value}</div>
      {hint && <div className="text-[9px] text-slate-600 font-mono">{hint}</div>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className={inputCls}
        />
        {suffix && <span className="text-[10px] text-slate-500 font-mono shrink-0">{suffix}</span>}
      </div>
    </label>
  );
}

export default function CombatUnitOptimizer({ userId, token }: CombatUnitOptimizerProps) {
  const [profile, setProfile] = useState<any>(null);
  const [importUserId, setImportUserId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [playerLevel, setPlayerLevel] = useState(45);
  const [pointsPerLevel, setPointsPerLevel] = useState(DEFAULT_POINTS_PER_LEVEL);
  const [lockedPoints, setLockedPoints] = useState(0);
  const [skillLevels, setSkillLevels] = useState<Record<CombatSkillKey, number>>(emptySkillLevels());
  const [economicSkillLevels, setEconomicSkillLevels] = useState<Record<EconomicSkillKey, number>>(emptyEconomicSkillLevels());
  const [equippedGear, setEquippedGear] = useState<UnitGear | null>(null);
  const [gear, setGear] = useState<UnitGear>({});

  const [marketPrices, setMarketPrices] = useState<Record<string, number> | null>(null);
  const [settings, setSettings] = useState<CombatSettings>({ ...DEFAULT_SETTINGS });

  const [optObjective, setOptObjective] = useState<OptimizeObjective>('dpd');
  const [optMode, setOptMode] = useState<'respec' | 'incremental'>('respec');
  const [recoLevels, setRecoLevels] = useState<Record<CombatSkillKey, number> | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  const [buildBudget, setBuildBudget] = useState(0);
  const [maxRarity, setMaxRarity] = useState('mythic');
  const [builds, setBuilds] = useState<BuildCandidate[] | null>(null);
  const [building, setBuilding] = useState(false);

  const [simSettings, setSimSettings] = useState<SimSettings>({ ...DEFAULT_SIM_SETTINGS });
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Sync simSettings prices dari marketPrices
  useEffect(() => {
    if (!marketPrices) return;
    setSimSettings((prev) => ({
      ...prev,
      case1Price: marketPrices['case1'] ?? prev.case1Price,
      case2Price: marketPrices['case2'] ?? prev.case2Price,
      scrapPrice: marketPrices['scraps'] ?? prev.scrapPrice,
    }));
  }, [marketPrices]);

  const importedRef = useRef(false);

  // Ambil harga pasar untuk consumable (ammo/food/pill)
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getItemPrices();
      if (alive && res.success) setMarketPrices(res.data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const gearOptions = useMemo(
    () => buildGearOptions(marketPrices),
    [marketPrices]
  );

  // Auto-import unit dari akun terhubung
  useEffect(() => {
    if (userId && !importedRef.current) {
      importedRef.current = true;
      importUnit(userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function importUnit(targetId: string) {
    if (!targetId || importing) return;
    setImporting(true);
    setImportError(null);
    const res = await getUserCombatProfile(targetId, token ?? null);
    setImporting(false);

    if (!res.success || !res.data?.profile) {
      setImportError(res.error || 'Gagal mengimpor unit. Periksa User ID.');
      return;
    }
    const p = res.data.profile;

    const newLevels = emptySkillLevels();
    COMBAT_SKILLS.forEach((def) => {
      newLevels[def.key] = clampLevel(p.skills?.[def.key]?.level ?? 0);
    });
    const newEconLevels = emptyEconomicSkillLevels();
    ECONOMIC_SKILLS.forEach((def) => {
      newEconLevels[def.key] = clampLevel(p.skills?.[def.key]?.level ?? 0);
    });
    const level = Math.max(1, Number(p.leveling?.level) || 1);
    setPlayerLevel(level);
    setSkillLevels(newLevels);
    setEconomicSkillLevels(newEconLevels);
    setProfile(p);

    // Poin yang dipakai di skill NON-combat (energi, perusahaan, produksi, dst)
    const nonCombatKeys = ['energy', 'companies', 'entrepreneurship', 'production', 'management'];
    const locked = nonCombatKeys.reduce((sum, k) => sum + skillTotalCost(p.skills?.[k]?.level ?? 0), 0);
    setLockedPoints(locked);

    // Gear terpasang (stat di-roll asli dari server)
    const eq = res.data.equipment;
    if (eq) {
      const newGear: UnitGear = {};
      const opts = buildGearOptions(marketPrices);
      const equipKeyBySlot: Partial<Record<GearSlot, keyof typeof eq>> = {
        weapon: 'weapon',
        helmet: 'helmet',
        chest: 'chest',
        pants: 'pants',
        boots: 'boots',
        gloves: 'gloves',
        ammo: 'ammo',
      };
      (Object.keys(equipKeyBySlot) as GearSlot[]).forEach((slot) => {
        const entry = eq[equipKeyBySlot[slot]!];
        if (!entry) return;
        const code = typeof entry === 'string' ? entry : entry.code;
        const item = opts[slot]?.find((o) => o.code === code);
        if (!item) return;
        const piece: GearPiece = { ...item };
        if (slot !== 'ammo' && entry.skills && typeof entry.skills === 'object') {
          const stats: Partial<Record<GearStatKey, number>> = { ...item.stats };
          Object.entries(entry.skills).forEach(([k, v]) => {
            stats[k as GearStatKey] = Number(v);
          });
          piece.stats = stats;
          if (slot === 'food') piece.healPercent = stats.healthRegenPercent;
        }
        newGear[slot] = piece;
      });
      setGear(newGear);
      setEquippedGear(newGear);
    }
  }

  function resetUnit() {
    setProfile(null);
    setPlayerLevel(1);
    setSkillLevels(emptySkillLevels());
    setEconomicSkillLevels(emptyEconomicSkillLevels());
    setLockedPoints(0);
    setGear({});
    setEquippedGear(null);
    setRecoLevels(null);
    setBuilds(null);
    setImportUserId('');
  }

  function updateGear(slot: GearSlot, piece: GearPiece | null | undefined) {
    setGear((g) => ({ ...g, [slot]: piece ?? undefined }));
  }
  function patchGear(slot: GearSlot, patch: Partial<GearPiece>) {
    setGear((g) => (g[slot] ? { ...g, [slot]: { ...g[slot]!, ...patch } } : g));
  }

  const totalPoints = Math.max(0, Math.round(playerLevel * pointsPerLevel));
  const spentPoints = sumSkillCost(skillLevels);
  const availablePoints = totalPoints - spentPoints - lockedPoints;

  const stats: CombatStats = useMemo(
    () => computeCombatStats(skillLevels, gear, settings),
    [skillLevels, gear, settings]
  );

  function runOptimize() {
    setOptimizing(true);
    // beri jeda agar spinner render
    setTimeout(() => {
      const res = optimizeSkills({
        skillLevels,
        playerLevel,
        pointsPerLevel,
        lockedNonCombatPoints: lockedPoints,
        objective: optObjective,
        gear,
        settings,
        mode: optMode,
      });
      setRecoLevels(res.levels);
      setOptimizing(false);
    }, 30);
  }

  function applyRecommendation() {
    if (recoLevels) setSkillLevels({ ...recoLevels });
  }

  function runGenerate() {
    setBuilding(true);
    setBuilds(null);
    setTimeout(() => {
      const results = generateBuilds({
        skillLevels,
        gearOptions,
        objective: 'dpd',
        settings,
        budget: buildBudget,
        maxRarity,
      });
      setBuilds(results);
      setBuilding(false);
    }, 30);
  }

  function applyBuild(b: BuildCandidate) {
    const copy: UnitGear = {};
    (Object.entries(b.gear) as [GearSlot, GearPiece][]).forEach(([slot, piece]) => {
      copy[slot] = { ...piece };
    });
    setGear(copy);
  }

  function runSimulation() {
    setSimulating(true);
    setTimeout(() => {
      const result = simulateCombat(
        stats,
        gear,
        { ...simSettings, bountyPer1000: settings.bountyPer1000 },
        settings,
        skillLevels.lootChance,
      );
      setSimResult(result);
      setSimulating(false);
    }, 30);
  }

  return (
    <div className="space-y-5">
      {/* ============ RINGKASAN ============ */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5">
        <StatBox label="Level Unit" value={String(playerLevel)} hint={`${pointsPerLevel} poin/level`} />
        <StatBox
          label="Poin Skill"
          value={`${spentPoints}/${totalPoints}`}
          hint={`sisa ${Math.max(0, availablePoints)} (+${lockedPoints} locked)`}
          accent={availablePoints > 0 ? 'text-emerald-400' : 'text-white'}
        />
        <StatBox label="DPH (Rata²)" value={fmtNum(stats.eDPH)} hint={`burst ${fmtNum(stats.eDPHBurst)}`} />
        <StatBox label="DPD (Hari)" value={fmtNum(stats.dPD)} hint={`${fmtNum(stats.hitsPerDay)} hit/hari`} accent="text-amber-400" />
        <StatBox label="Biaya Build" value={<><span className="inline-flex items-center gap-1">{formatPrice(stats.buildCost)} <CurrencyIcon /></span></>} hint="perkiraan" />
        <StatBox label="Cost / Hit" value={formatPrice(stats.costPerHit)} hint="ammo+food+wear" />
        <StatBox label="Dmg / Gold" value={stats.damagePerGold > 0 ? fmtNum(stats.damagePerGold) : '—'} hint="efisiensi per hit" />
        <StatBox
          label="Net / Hit"
          value={settings.bountyPer1000 > 0 ? formatPrice(stats.netPerHit) : '—'}
          hint={settings.bountyPer1000 > 0 ? `bounty ${settings.bountyPer1000}/1k` : 'isi bounty di model'}
          accent={settings.bountyPer1000 > 0 && stats.netPerHit >= 0 ? 'text-emerald-400' : 'text-white'}
        />
      </div>

      {/* ============ MODEL SIMULASI ============ */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Model Simulasi</h3>
          </div>
          <button
            onClick={() => setSettings({ ...DEFAULT_SETTINGS })}
            className="text-[10px] text-slate-500 hover:text-emerald-400 font-bold uppercase tracking-wider transition cursor-pointer"
          >
            Reset Model
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field
            label="Bonus Rank %"
            value={settings.militaryRankPercent}
            onChange={(v) => setSettings((s) => ({ ...s, militaryRankPercent: v }))}
            suffix="%"
          />
          <Field
            label="Bounty / 1k Dmg"
            value={settings.bountyPer1000}
            onChange={(v) => setSettings((s) => ({ ...s, bountyPer1000: v }))}
            step={0.01}
            min={0}
            suffix="cc"
          />
          <Field
            label="Ammo / Hit"
            value={settings.ammoPerHit}
            onChange={(v) => setSettings((s) => ({ ...s, ammoPerHit: Math.max(0, v) }))}
            min={0}
          />
        </div>
        <p className="text-[10px] text-slate-600 mt-2.5 leading-relaxed">
          Formula mengikuti WarEra War Planner: Attack = (skill + weapon) × ammo × pill(1.6x) × rank;
          Precision cap 100% (overflow→Attack ×4); Crit Chance cap 60% (overflow→Crit Dmg ×4);
          Armor DR = armor/(armor+40) cap 90%; HP/hunger regen 10%/jam. Pill = toggle (+60% ATK, food multiplier 1.8x, harga flat/hari).
        </p>
      </Card>

      {/* ============ LANGKAH 1: IMPORT UNIT ============ */}
      <Card>
        <StepHeader
          step={1}
          title="Import Unit"
          subtitle="Ambil level, skill & perlengkapan terpasang dari server WarEra (data publik)."
          icon={<UserRound className="w-4 h-4" />}
        />

        {!profile ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={importUserId}
                onChange={(e) => setImportUserId(e.target.value)}
                placeholder="User ID (contoh: 6813b758efecdf9bab195068)"
                className={inputCls}
              />
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => importUnit(importUserId)}
                  disabled={importing || !importUserId}
                  className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 hover:border-emerald-500/50 text-slate-200 font-bold px-3.5 py-1.5 rounded-lg text-xs transition duration-150 cursor-pointer disabled:opacity-50"
                >
                  {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Import
                </button>
                {userId && (
                  <button
                    onClick={() => importUnit(userId)}
                    disabled={importing}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3.5 py-1.5 rounded-lg text-xs transition duration-150 cursor-pointer disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Akun Terhubung
                  </button>
                )}
              </div>
            </div>
            {importError && (
              <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {importError}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <Info className="w-3 h-3" />
              Belum terhubung? Isi manual field di bawah, atau hubungkan akun lewat tombol Connect di header.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                {(profile.username || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold text-white">{profile.username}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Level {profile.leveling?.level} · {profile.leveling?.totalSkillPoints} poin total ·{' '}
                  {profile.leveling?.spentSkillPoints} terpakai · {profile.leveling?.availableSkillPoints} tersisa
                </div>
              </div>
              <button
                onClick={resetUnit}
                className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-400 font-bold uppercase tracking-wider transition cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Reset
              </button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400 font-mono">
              <span>Attack <b className="text-slate-200">{profile.skills?.attack?.level ?? 0}</b></span>
              <span>Precision <b className="text-slate-200">{profile.skills?.precision?.level ?? 0}</b></span>
              <span>Crit <b className="text-slate-200">{profile.skills?.criticalChance?.level ?? 0}</b></span>
              <span>Armor <b className="text-slate-200">{profile.skills?.armor?.level ?? 0}</b></span>
              <span>Dodge <b className="text-slate-200">{profile.skills?.dodge?.level ?? 0}</b></span>
              <span>Health <b className="text-slate-200">{profile.skills?.health?.level ?? 0}</b></span>
              <span>Hunger <b className="text-slate-200">{profile.skills?.hunger?.level ?? 0}</b></span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400 font-mono mt-1.5">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mr-1">Economic:</span>
              <span>Entrepreneurship <b className="text-slate-200">{profile.skills?.entrepreneurship?.level ?? 0}</b></span>
              <span>Energy <b className="text-slate-200">{profile.skills?.energy?.level ?? 0}</b></span>
              <span>Production <b className="text-slate-200">{profile.skills?.production?.level ?? 0}</b></span>
              <span>Companies <b className="text-slate-200">{profile.skills?.companies?.level ?? 0}</b></span>
              <span>Management <b className="text-slate-200">{profile.skills?.management?.level ?? 0}</b></span>
            </div>
          </div>
        )}

        {/* Manual unit settings */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/60">
          <Field label="Level Unit" value={playerLevel} onChange={(v) => setPlayerLevel(Math.max(1, Math.round(v)))} min={1} max={100} />
          <Field label="Poin / Level" value={pointsPerLevel} onChange={(v) => setPointsPerLevel(Math.max(1, Math.round(v)))} min={1} max={10} />
          <Field label="Poin Non-Combat" value={lockedPoints} onChange={(v) => setLockedPoints(Math.max(0, Math.round(v)))} min={0} />
          <div className="flex items-end pb-1">
            <div className="text-[11px] text-slate-500 font-mono">
              Total <b className="text-slate-200">{totalPoints}</b> · Terpakai <b className="text-slate-200">{spentPoints}</b> · Sisa{' '}
              <b className={availablePoints >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{availablePoints}</b>
            </div>
          </div>
        </div>
      </Card>

      {/* ============ LANGKAH 2: OPTIMASI SKILL ============ */}
      <Card>
        <StepHeader
          step={2}
          title="Optimasi Skill"
          subtitle="Alokasikan 4 poin skill per level untuk memaksimalkan output unit — dengan batasan unlock level tiap skill."
          icon={<SlidersHorizontal className="w-4 h-4" />}
        />

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Tujuan</span>
            <select
              value={optObjective}
              onChange={(e) => setOptObjective(e.target.value as OptimizeObjective)}
              className={selectCls}
            >
              <option value="dpd">Damage per Hari (sustain)</option>
              <option value="dph">Damage per Hit (burst)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Mode</span>
            <select
              value={optMode}
              onChange={(e) => setOptMode(e.target.value as 'respec' | 'incremental')}
              className={selectCls}
            >
              <option value="respec">Respec penuh (skill combat)</option>
              <option value="incremental">Optimalkan sisa poin</option>
            </select>
          </label>
          <button
            onClick={runOptimize}
            disabled={optimizing}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition duration-150 cursor-pointer disabled:opacity-60"
          >
            {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            Optimalkan Skill
          </button>
          {recoLevels && (
            <button
              onClick={applyRecommendation}
              className="flex items-center gap-1.5 bg-slate-900 border border-emerald-500/40 hover:bg-slate-800 text-emerald-400 font-bold px-4 py-2 rounded-lg text-xs transition duration-150 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Terapkan Rekomendasi
            </button>
          )}
          <label className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider cursor-pointer ml-auto">
            <input
              type="checkbox"
              onChange={(e) => {
                if (e.target.checked) {
                  document.getElementById('step-4')?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="w-3.5 h-3.5 accent-emerald-500"
            />
            Langsung ke Build
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[640px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-2 font-bold">Skill</th>
                <th className="py-2 pr-2 font-bold text-right">Level</th>
                <th className="py-2 pr-2 font-bold text-right">Nilai</th>
                <th className="py-2 pr-2 font-bold text-right">Rekomendasi</th>
                <th className="py-2 pr-2 font-bold text-right">Nilai Reko</th>
                <th className="py-2 font-bold text-right">Poin</th>
              </tr>
            </thead>
            <tbody>
              {COMBAT_SKILLS.map((def) => {
                const lv = skillLevels[def.key];
                const recLv = recoLevels ? recoLevels[def.key] : null;
                const value = skillValue(def, lv);
                const unlocked = playerLevel >= def.unlockAtLevel;
                const isLocked = def.key === 'lootChance';
                return (
                  <tr key={def.key} className="border-t border-slate-800/50">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200">{def.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                          def.group === 'damage' ? 'bg-rose-500/10 text-rose-400'
                          : def.group === 'defense' ? 'bg-sky-500/10 text-sky-400'
                          : 'bg-amber-500/10 text-amber-400'
                        }`}>{def.group}</span>
                        {isLocked && <span className="text-[9px] text-slate-600 font-mono">manual</span>}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">{def.desc} · buka Lv {def.unlockAtLevel}</div>
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <select
                        value={lv}
                        disabled={!unlocked || isLocked}
                        onChange={(e) => setSkillLevels((s) => ({ ...s, [def.key]: clampLevel(Number(e.target.value)) }))}
                        className={`${selectCls} w-16 ${!unlocked ? 'opacity-40' : ''}`}
                      >
                        {Array.from({ length: MAX_SKILL_LEVEL + 1 }, (_, i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-slate-300">{value}</td>
                    <td className="py-2 pr-2 text-right">
                      {recLv !== null ? (
                        <span className={`font-mono font-bold ${recLv > lv ? 'text-emerald-400' : recLv < lv ? 'text-amber-400' : 'text-slate-400'}`}>
                          {recLv}
                          {recLv !== lv && <span className="text-[9px] ml-0.5">{recLv > lv ? '▲' : '▼'}</span>}
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-slate-400">
                      {recLv !== null ? skillValue(def, recLv) : '—'}
                    </td>
                    <td className="py-2 text-right font-mono text-slate-500">
                      {skillTotalCost(lv)} <span className="text-[9px] text-slate-700">/ max {skillTotalCost(MAX_SKILL_LEVEL)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {recoLevels && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-400 font-mono">
            <span>Rekomendasi habiskan <b className="text-emerald-400">{sumSkillCost(recoLevels)}</b> poin</span>
            <span>
              Perubahan DPH: <b className={stats.eDPH > 0 ? 'text-slate-200' : ''}>{fmtNum(stats.eDPH)}</b>
            </span>
          </div>
        )}

        {/* Economic Skills Table */}
        <div className="mt-4 pt-4 border-t border-slate-800/60">
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Economic Skills</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[400px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-2 font-bold">Skill</th>
                  <th className="py-2 pr-2 font-bold text-right">Level</th>
                  <th className="py-2 pr-2 font-bold text-right">Nilai</th>
                  <th className="py-2 font-bold text-right">Poin</th>
                </tr>
              </thead>
              <tbody>
                {ECONOMIC_SKILLS.map((def) => {
                  const lv = economicSkillLevels[def.key];
                  const value = def.base + def.perLevel * clampLevel(lv);
                  return (
                    <tr key={def.key} className="border-t border-slate-800/50">
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">{def.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400">economic</span>
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5">{def.desc}</div>
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <select
                          value={lv}
                          onChange={(e) => setEconomicSkillLevels((s) => ({ ...s, [def.key]: clampLevel(Number(e.target.value)) }))}
                          className={`${selectCls} w-16`}
                        >
                          {Array.from({ length: MAX_SKILL_LEVEL + 1 }, (_, i) => (
                            <option key={i} value={i}>{i}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-2 text-right font-mono text-slate-300">{value}</td>
                      <td className="py-2 text-right font-mono text-slate-500">
                        {skillTotalCost(lv)} <span className="text-[9px] text-slate-700">/ max {skillTotalCost(MAX_SKILL_LEVEL)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* ============ LANGKAH 3: PILIH GEAR ============ */}
      <Card>
        <StepHeader
          step={3}
          title="Pilih Gear"
          subtitle="Stat gear memengaruhi attack, crit, armor, dodge & precision. Amunisi & makanan berperan di sustain harian."
          icon={<Shield className="w-4 h-4" />}
        />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {equippedGear && (
            <button
              onClick={() => setGear(equippedGear)}
              className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 hover:border-emerald-500/50 text-slate-200 font-bold px-3 py-1.5 rounded-lg text-xs transition duration-150 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Perlengkapan Terpasang
            </button>
          )}
          <button
            onClick={() => setGear({})}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-rose-400 font-bold uppercase tracking-wider transition cursor-pointer"
          >
            Kosongkan Semua
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {GEAR_SLOTS.map(({ slot }) => (
            <GearSlotPicker
              key={slot}
              slot={slot}
              label={SLOT_LABEL[slot]}
              icon={SLOT_ICONS[slot]}
              options={gearOptions[slot] ?? []}
              piece={gear[slot]}
              onSelect={(p) => updateGear(slot, p)}
              onPatch={(patch) => patchGear(slot, patch)}
            />
          ))}
        </div>
      </Card>

      {/* ============ LANGKAH 4: GENERATE BUILDS ============ */}
      <Card id="step-4">
        <StepHeader
          step={4}
          title="Generate Builds"
          subtitle="Cari kombinasi gear terbaik untuk Damage Per Hari (DPD)."
          icon={<Target className="w-4 h-4" />}
        />

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Max Rarity</span>
            <select
              value={maxRarity}
              onChange={(e) => setMaxRarity(e.target.value)}
              className={selectCls}
            >
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
              <option value="mythic">Mythic</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-slate-300 text-[10px] font-bold uppercase tracking-wider cursor-pointer">
            <input
              type="checkbox"
              checked={settings.pillEnabled}
              onChange={(e) => setSettings((s) => ({ ...s, pillEnabled: e.target.checked }))}
              className="w-4 h-4 rounded bg-slate-800 border-slate-600 accent-emerald-500"
            />
            Pill (+60% ATK)
          </label>
          <Field
            label="Budget Build (cc, 0 = tak terbatas)"
            value={buildBudget}
            onChange={(v) => setBuildBudget(Math.max(0, v))}
            step={50}
            min={0}
          />
          <button
            onClick={runGenerate}
            disabled={building}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition duration-150 cursor-pointer disabled:opacity-60"
          >
            {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate Builds
          </button>
        </div>

        {building && (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> Menghitung kombinasi terbaik…
          </div>
        )}

        {builds && !building && (
          <>
            <div className="text-[10px] text-slate-500 font-mono mb-3">
              {builds.length} build terbaik (dari semua kombinasi slot) · klik untuk memakai gear build tersebut
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {builds.map((b, i) => (
                <BuildCard
                  key={i}
                  rank={i + 1}
                  build={b}
                  settings={settings}
                  onApply={() => applyBuild(b)}
                />
              ))}
            </div>
          </>
        )}

        {!builds && !building && (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-600 text-xs border border-dashed border-slate-800 rounded-xl">
            <ArrowRight className="w-4 h-4" /> Atur skill & gear, lalu tekan Generate Builds
          </div>
        )}
      </Card>

      {/* ============ LANGKAH 5: COMBAT LOG / SIMULATION ============ */}
      <Card>
        <StepHeader
          step={5}
          title="Combat Log"
          subtitle="Simulasi aktual dengan RNG — lihat damage, cost, revenue, dan profit secara realistis."
          icon={<Zap className="w-4 h-4" />}
        />

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <Field
            label="Jumlah Hit"
            value={simSettings.numHits}
            onChange={(v) => setSimSettings((s) => ({ ...s, numHits: Math.max(1, Math.round(v)) }))}
            min={1}
            max={10000}
          />
          <Field
            label="Harga Case 1 (cc)"
            value={simSettings.case1Price}
            onChange={(v) => setSimSettings((s) => ({ ...s, case1Price: Math.max(0, v) }))}
            step={0.1}
            min={0}
          />
          <Field
            label="Harga Case 2 (cc)"
            value={simSettings.case2Price}
            onChange={(v) => setSimSettings((s) => ({ ...s, case2Price: Math.max(0, v) }))}
            step={0.1}
            min={0}
          />
          <Field
            label="Harga Scrap (cc)"
            value={simSettings.scrapPrice}
            onChange={(v) => setSimSettings((s) => ({ ...s, scrapPrice: Math.max(0, v) }))}
            step={0.01}
            min={0}
          />
          <button
            onClick={runSimulation}
            disabled={simulating}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition duration-150 cursor-pointer disabled:opacity-60"
          >
            {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Run Simulation
          </button>
        </div>

        {simResult && (
          <div className="space-y-4">
            {/* Summary Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <StatBox
                label="Total Damage"
                value={fmtNum(simResult.totalDamage)}
                hint={`${simResult.totalHits} hits`}
                accent="text-white"
              />
              <StatBox
                label="Avg / Hit"
                value={fmtNum(simResult.avgDamage)}
                hint={`burst ${fmtNum(simResult.burstDamage)}`}
              />
              <StatBox
                label="Cost / 1k Dmg"
                value={`${fmtNum(simResult.costPer1kDmg)} G`}
                accent={simResult.costPer1kDmg > 0 ? 'text-amber-400' : 'text-white'}
              />
              <StatBox
                label="Net Profit"
                value={`${simResult.netProfit >= 0 ? '+' : ''}${fmtNum(simResult.netProfit)} G`}
                hint={`ROI ${simResult.roi}%`}
                accent={simResult.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}
              />
            </div>

            {/* Hit Distribution */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-[#0E1017] border border-slate-800/70 rounded-lg p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-sky-300">{simResult.normalHits}</div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Normal</div>
              </div>
              <div className="bg-[#0E1017] border border-slate-800/70 rounded-lg p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-amber-300">{simResult.critHits} <span className="text-[10px] text-slate-500">({simResult.critPct.toFixed(1)}%)</span></div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Crit</div>
              </div>
              <div className="bg-[#0E1017] border border-slate-800/70 rounded-lg p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-slate-400">{simResult.missHits} <span className="text-[10px] text-slate-500">({simResult.missPct.toFixed(1)}%)</span></div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Miss</div>
              </div>
              <div className="bg-[#0E1017] border border-slate-800/70 rounded-lg p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-rose-300">{simResult.dodgeHits} <span className="text-[10px] text-slate-500">({simResult.dodgePct.toFixed(1)}%)</span></div>
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Dodge</div>
              </div>
            </div>

            {/* Damage vs Expected */}
            {simResult.expectedDamage > 0 && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span>Damage: <b className="text-white">{fmtNum(simResult.totalDamage)}</b></span>
                <span className={simResult.totalDamage >= simResult.expectedDamage ? 'text-emerald-400' : 'text-rose-400'}>
                  ({simResult.totalDamage >= simResult.expectedDamage ? '+' : ''}
                  {((simResult.totalDamage - simResult.expectedDamage) / simResult.expectedDamage * 100).toFixed(1)}% vs expected {fmtNum(simResult.expectedDamage)})
                </span>
              </div>
            )}

            {/* Costs & Revenue */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Costs */}
              <div className="bg-[#0E1017] border border-slate-800/70 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Costs</span>
                  <span className="text-xs font-mono font-bold text-rose-300">{fmtNum(simResult.costs.total)} G</span>
                </div>
                <div className="space-y-1.5 text-[10px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Weapon</span>
                    <span className="text-slate-300">{fmtNum(simResult.costs.weapon)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Armor</span>
                    <span className="text-slate-300">{fmtNum(simResult.costs.armor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ammo ({simSettings.numHits})</span>
                    <span className="text-slate-300">{fmtNum(simResult.costs.ammo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Food</span>
                    <span className="text-slate-300">{fmtNum(simResult.costs.food)}</span>
                  </div>
                  {simResult.costs.booster > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Booster</span>
                      <span className="text-slate-300">{fmtNum(simResult.costs.booster)}</span>
                    </div>
                  )}
                  {simResult.resources.steelConsumed > 0 && (
                    <div className="flex justify-between border-t border-slate-800/50 pt-1.5">
                      <span className="text-slate-500">Steel consumed</span>
                      <span className="text-slate-400">{simResult.resources.steelConsumed}</span>
                    </div>
                  )}
                  {simResult.resources.scrapConsumed > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Scrap consumed</span>
                      <span className="text-slate-400">{simResult.resources.scrapConsumed}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Revenue */}
              <div className="bg-[#0E1017] border border-slate-800/70 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Revenue</span>
                  <span className="text-xs font-mono font-bold text-emerald-300">{fmtNum(simResult.revenue.total)} G</span>
                </div>
                <div className="space-y-1.5 text-[10px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bounty</span>
                    <span className="text-slate-300">{fmtNum(simResult.revenue.bounty)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Case 1 ({simResult.revenue.case1Drops})</span>
                    <span className="text-slate-300">{fmtNum(simResult.revenue.case1Revenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Case 2 ({simResult.revenue.case2Drops})</span>
                    <span className="text-slate-300">{fmtNum(simResult.revenue.case2Revenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Scrap ({simResult.revenue.scrapDrops})</span>
                    <span className="text-slate-300">{fmtNum(simResult.revenue.scrapRevenue)}</span>
                  </div>
                </div>

                {/* Net Profit Bar */}
                <div className="mt-3 pt-2 border-t border-slate-800/50">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Net Profit</span>
                    <span className={`font-bold ${simResult.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {simResult.netProfit >= 0 ? '+' : ''}{fmtNum(simResult.netProfit)} G
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono mt-1">
                    <span className="text-slate-500">ROI</span>
                    <span className={`font-bold ${simResult.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {simResult.roi}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!simResult && (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-600 text-xs border border-dashed border-slate-800 rounded-xl">
            <Zap className="w-4 h-4" /> Atur jumlah hit & harga item, lalu tekan Run Simulation
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================

function GearSlotPicker({
  slot,
  label,
  icon,
  options,
  piece,
  onSelect,
  onPatch,
}: {
  slot: GearSlot;
  label: string;
  icon: React.ReactNode;
  options: GearPiece[];
  piece?: GearPiece;
  onSelect: (piece: GearPiece | null) => void;
  onPatch: (patch: Partial<GearPiece>) => void;
}) {
  const dynamicKeys = piece?.ranges ? (Object.keys(piece.ranges) as GearStatKey[]) : [];

  return (
    <div className={`bg-[#0E1017] border rounded-xl p-3 ${piece ? 'border-emerald-500/25' : 'border-slate-800/70'}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 shrink-0">
          {icon}
        </div>
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{label}</span>
        <select
          value={piece?.code ?? ''}
          onChange={(e) => {
            const opt = options.find((o) => o.code === e.target.value);
            onSelect(opt ?? null);
          }}
          className={`${selectCls} flex-1 ml-auto`}
        >
          <option value="">— Kosong —</option>
          {options.map((o) => (
            <option key={o.code} value={o.code} className={rarityColor(o.rarity)}>
              [{o.rarity}] {o.name}
            </option>
          ))}
        </select>
      </div>

      {piece ? (
        <div className="flex items-start gap-3">
          <ItemIcon itemCode={piece.code} size="sm" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <span className={`text-[10px] font-mono font-bold uppercase ${rarityColor(piece.rarity)}`}>
                {piece.rarity}
              </span>
              {(Object.keys(piece.stats) as GearStatKey[]).map((k) => (
                <span key={k} className="text-[10px] font-mono bg-slate-900 border border-slate-800 rounded-md px-1.5 py-0.5 text-slate-300">
                  {STAT_LABELS[k]} <b className={k === 'percentAttack' || k === 'healthRegenPercent' ? 'text-emerald-400' : 'text-sky-300'}>
                    {k === 'percentAttack' || k === 'healthRegenPercent' ? `+${piece.stats[k]}%` : `+${piece.stats[k]}`}
                  </b>
                </span>
              ))}
              {piece.healPercent && (
                <span className="text-[10px] font-mono bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-0.5 text-amber-300">
                  Heal {piece.healPercent}% HP
                </span>
              )}
              {piece.buffPercent && (
                <span className="text-[10px] font-mono bg-rose-500/10 border border-rose-500/20 rounded-md px-1.5 py-0.5 text-rose-300">
                  Buff +{piece.buffPercent}% (8h / −60% 15.5h)
                </span>
              )}
            </div>

            {/* Roll stat (senjata & armor) */}
            {dynamicKeys.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {dynamicKeys.map((k) => (
                  <label key={k} className="block w-24">
                    <span className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">{STAT_LABELS[k]}</span>
                    <input
                      type="number"
                      value={piece.stats[k] ?? 0}
                      min={piece.ranges?.[k]?.[0]}
                      max={piece.ranges?.[k]?.[1]}
                      onChange={(e) => onPatch({ stats: { ...piece.stats, [k]: Number(e.target.value) } })}
                      className={inputCls}
                    />
                  </label>
                ))}
              </div>
            )}

            {/* Harga */}
            <div className="flex items-center gap-2">
              <label className="block flex-1">
                <span className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">Harga (cc)</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={piece.price}
                    min={0}
                    step={0.01}
                    onChange={(e) => onPatch({ price: Math.max(0, Number(e.target.value)) })}
                    className={inputCls}
                  />
                  <CurrencyIcon />
                </div>
              </label>
              {piece.priceSource === 'market' ? (
                <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider shrink-0">Harga Pasar</span>
              ) : (
                <span className="text-[9px] text-amber-500/80 font-bold uppercase tracking-wider shrink-0">Estimasi</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-2 text-[10px] text-slate-600 border border-dashed border-slate-800 rounded-lg">
          Tidak dipakai
        </div>
      )}
    </div>
  );
}

function BuildCard({
  rank,
  build,
  objective,
  settings,
  onApply,
}: {
  rank: number;
  build: BuildCandidate;
  settings: CombatSettings;
  onApply: () => void;
}) {
  const s = build.stats;
  const metricLabel = 'DPD';
  const metricValue = fmtNum(s.dPD);

  const slots: GearSlot[] = ['weapon', 'helmet', 'chest', 'pants', 'boots', 'gloves', 'ammo', 'food'];

  return (
    <div className={`bg-[#0E1017] border rounded-xl p-3.5 ${rank === 1 ? 'border-emerald-500/40 shadow-lg shadow-emerald-950/20' : 'border-slate-800/70'}`}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          {rank === 1 ? (
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">
              <Zap className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center font-mono font-bold text-xs">
              #{rank}
            </div>
          )}
          <div>
            <div className="text-base font-mono font-bold text-white">{metricValue}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{metricLabel}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-sm font-mono font-bold text-slate-200">
            {formatPrice(build.cost)} <CurrencyIcon />
          </div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Biaya Build</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px] font-mono text-slate-400 mb-3">
        <span>DPH {fmtNum(s.eDPHBurst)}</span>
        <span>DPD {fmtNum(s.dPD)}</span>
        <span>Hit/hari {fmtNum(s.hitsPerDay)}</span>
        <span>Cost/hit {formatPrice(s.costPerHit)}</span>
        <span>Precision {fmtPct(s.precision / 100)}</span>
        <span>Crit {fmtPct(s.critChance / 100)}</span>
        <span>Armor DR {fmtPct(s.armorDR)}</span>
        <span>Dodge {fmtPct(s.dodgeRate)}</span>
        {settings.bountyPer1000 > 0 && (
          <span className={s.netPerHit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            Net/hit {formatPrice(s.netPerHit)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {slots
          .filter((sl) => build.gear[sl])
          .map((sl) => (
            <span
              key={sl}
              className={`inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg pl-1 pr-2 py-0.5 text-[10px] ${rarityColor(build.gear[sl]!.rarity)}`}
            >
              <ItemIcon itemCode={build.gear[sl]!.code} size="sm" className="!w-4 !h-4" />
              {build.gear[sl]!.name}
            </span>
          ))}
      </div>

      <button
        onClick={onApply}
        className="w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-emerald-600 hover:text-slate-950 border border-slate-700 hover:border-emerald-500 text-slate-300 font-bold py-1.5 rounded-lg text-xs transition duration-150 cursor-pointer"
      >
        <Check className="w-3.5 h-3.5" /> Pakai Gear Ini
      </button>
    </div>
  );
}
