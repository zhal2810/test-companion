import React from 'react';
import { GlobalSettings } from '../types';
import { PRODUCTION_SKILL_VALUES } from '../data/gameConfig';
import { Settings, Award, Users, MapPin } from 'lucide-react';

interface GlobalSettingsPanelProps {
  settings: GlobalSettings;
  onChange: (settings: GlobalSettings) => void;
}

export default function GlobalSettingsPanel({ settings, onChange }: GlobalSettingsPanelProps) {
  const handleSkillChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...settings,
      productionSkillLevel: parseInt(e.target.value, 10),
    });
  };

  const handleFidelityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...settings,
      globalWorkerFidelity: Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0)),
    });
  };

  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...settings,
      globalRegionBonus: parseFloat(e.target.value),
    });
  };

  return (
    <div className="bg-[#0F1117] border border-slate-800 rounded-xl p-5 shadow-lg text-slate-100" id="global-settings-panel">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
        <Settings className="w-5 h-5 text-indigo-400" id="settings-icon" />
        <h2 className="text-lg font-semibold tracking-tight text-white">Global Player Profile Settings</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Production Skill Level */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-amber-500" />
            Production Skill Level
          </label>
          <select
            id="production-skill-select"
            value={settings.productionSkillLevel}
            onChange={handleSkillChange}
            className="bg-[#0A0C10] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            {PRODUCTION_SKILL_VALUES.map((val, idx) => (
              <option key={idx} value={idx}>
                Level {idx} (+{val} Points/Action)
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500 italic">
            Sets default production points generated per player action.
          </span>
        </div>

        {/* Global Worker Fidelity */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            Default Worker Fidelity
          </label>
          <div className="flex items-center gap-2">
            <input
              id="worker-fidelity-input"
              type="range"
              min="0"
              max="10"
              value={settings.globalWorkerFidelity}
              onChange={handleFidelityChange}
              className="w-full accent-indigo-500 h-1.5 bg-[#0A0C10] rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm font-mono font-semibold text-slate-200 min-w-[2.5rem] text-right">
              Lvl {settings.globalWorkerFidelity}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 italic">
            +{settings.globalWorkerFidelity}% production points bonus for all hired workers.
          </span>
        </div>

        {/* Region Resource Bonus */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            Default Region Resource Bonus
          </label>
          <select
            id="region-bonus-select"
            value={settings.globalRegionBonus}
            onChange={handleRegionChange}
            className="bg-[#0A0C10] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="0">Standard Region (0% Bonus)</option>
            <option value="0.25">Medium Resource Region (+25% Bonus)</option>
            <option value="0.5">High Resource Region (+50% Bonus)</option>
            <option value="1.0">Maximum Resource Region (+100% Bonus)</option>
          </select>
          <span className="text-[11px] text-slate-500 italic">
            Applies a multiplier to all manual, worker, and engine production points.
          </span>
        </div>
      </div>
    </div>
  );
}
