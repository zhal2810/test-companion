import { Company, GlobalSettings } from '../types';
import { GAME_ITEMS } from '../data/gameConfig';
import { calculateCompanyProduction } from '../utils/productionHelper';
import { Trash2, Cpu, Wrench, Package, Info, ShieldAlert } from 'lucide-react';

interface CompanyCardProps {
  key?: string;
  company: Company;
  globalSettings: GlobalSettings;
  onUpdate: (updated: Company) => void;
  onDelete: () => void;
}

export default function CompanyCard({ company, globalSettings, onUpdate, onDelete }: CompanyCardProps) {
  const itemConfig = GAME_ITEMS[company.itemCode] || GAME_ITEMS[company.itemCode.toLowerCase()];
  const prodResult = calculateCompanyProduction(company, globalSettings);

  const handleFieldChange = (key: keyof Company, value: any) => {
    onUpdate({
      ...company,
      [key]: value,
    });
  };

  return (
    <div className="bg-[#161920] border border-slate-800 hover:border-slate-700 transition rounded-xl p-5 shadow-lg text-slate-100 flex flex-col gap-4" id={`company-card-${company.id}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex-1 min-w-0">
          <input
            id={`company-name-input-${company.id}`}
            type="text"
            value={company.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            className="w-full bg-transparent text-base font-bold text-white focus:outline-none border-b border-transparent focus:border-slate-700 hover:border-slate-800 pb-0.5 rounded px-1 -mx-1"
            placeholder="Company Name"
          />
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`inline-block w-2 h-2 rounded-full ${itemConfig?.type === 'raw' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <span className="text-xs text-slate-400 font-medium capitalize">
              {itemConfig?.type === 'raw' ? 'Bahan Mentah (Raw)' : 'Barang Jadi (Product)'}
            </span>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="text-slate-500 hover:text-red-400 p-1.5 hover:bg-[#0A0C10] rounded-lg transition cursor-pointer"
          title="Hapus Company"
          id={`delete-btn-${company.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Production Setup */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-400">Produced Item</label>
          <select
            id={`item-select-${company.id}`}
            value={company.itemCode}
            onChange={(e) => handleFieldChange('itemCode', e.target.value)}
            className="bg-[#0A0C10] border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full cursor-pointer"
          >
            <optgroup label="Bahan Mentah (Raw)" className="bg-[#0A0C10]">
              {Object.values(GAME_ITEMS)
                .filter((it) => it.type === 'raw')
                .map((it) => (
                  <option key={it.code} value={it.code}>
                    {it.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Barang Jadi (Product)" className="bg-[#0A0C10]">
              {Object.values(GAME_ITEMS)
                .filter((it) => it.type === 'product')
                .map((it) => (
                  <option key={it.code} value={it.code}>
                    {it.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-400">Production Mode</label>
          <select
            id={`mode-select-${company.id}`}
            value={company.mode}
            onChange={(e) => handleFieldChange('mode', e.target.value as any)}
            className="bg-[#0A0C10] border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full cursor-pointer"
          >
            <option value="manual">Manual Work</option>
            <option value="automated">Automated Engine</option>
            <option value="both">Both (Manual + Engine)</option>
          </select>
        </div>
      </div>

      {/* Manual / Worker Controls */}
      {(company.mode === 'manual' || company.mode === 'both') && (
        <div className="bg-[#0A0C10] border border-slate-800/80 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-1.5">
            <Wrench className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-bold text-slate-300">Manual / Worker Configuration</span>
          </div>
          
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Your Actions / Day</span>
              <span className="text-slate-200 font-mono font-semibold">{company.manualActions} actions</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={company.manualActions}
              onChange={(e) => handleFieldChange('manualActions', parseInt(e.target.value, 10))}
              className="accent-indigo-500 h-1 bg-[#161920] rounded appearance-none cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-slate-400">Hired Workers</span>
              <input
                type="number"
                min="0"
                max="10"
                value={company.workerCount}
                onChange={(e) => handleFieldChange('workerCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="bg-[#161920] border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-slate-400">Actions / Worker</span>
              <input
                type="number"
                min="0"
                max="50"
                value={company.workerActions}
                onChange={(e) => handleFieldChange('workerActions', Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="bg-[#161920] border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-1">
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Worker Fidelity override</span>
              <span className="text-slate-200 font-mono font-medium">Lvl {company.workerFidelity}</span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              value={company.workerFidelity}
              onChange={(e) => handleFieldChange('workerFidelity', parseInt(e.target.value, 10))}
              className="accent-indigo-500 h-1 bg-[#161920] rounded appearance-none cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Automated Engine Controls */}
      {(company.mode === 'automated' || company.mode === 'both') && (
        <div className="bg-[#0A0C10] border border-slate-800/80 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-1.5">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-slate-300">Automated Engine Configuration</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-slate-400">Engine Level (1-7)</span>
              <select
                id={`engine-level-${company.id}`}
                value={company.engineLevel}
                onChange={(e) => handleFieldChange('engineLevel', parseInt(e.target.value, 10))}
                className="bg-[#161920] border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-mono"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Lvl {lvl}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-slate-400">Regional Bonus Override</span>
              <select
                id={`region-override-${company.id}`}
                value={company.regionBonus}
                onChange={(e) => handleFieldChange('regionBonus', parseFloat(e.target.value))}
                className="bg-[#161920] border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none cursor-pointer font-mono"
              >
                <option value="0">0% Bonus</option>
                <option value="0.25">+25% Bonus</option>
                <option value="0.5">+50% Bonus</option>
                <option value="1.0">+100% Bonus</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Outputs / Live Summary */}
      <div className="mt-auto bg-[#0A0C10] border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">Daily Production Yield</span>
          <span className="text-xs font-mono font-bold text-indigo-400">{prodResult.productionPoints.toFixed(0)} PTS</span>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-2">
          <div className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs text-slate-300 font-bold">{itemConfig?.name}</span>
          </div>
          <span className="text-sm font-mono font-bold text-emerald-400">
            +{prodResult.producedQty.toFixed(2)} / day
          </span>
        </div>

        {/* Recipe Needs */}
        {prodResult.inputsNeeded.length > 0 && (
          <div className="border-t border-slate-800 pt-2 mt-0.5">
            <div className="text-[10px] text-slate-500 font-semibold mb-1 uppercase tracking-wider">Required Inputs:</div>
            <div className="flex flex-col gap-1">
              {prodResult.inputsNeeded.map((inp) => {
                const reqItem = GAME_ITEMS[inp.itemCode] || GAME_ITEMS[inp.itemCode.toLowerCase()];
                return (
                  <div key={inp.itemCode} className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/80" />
                      {reqItem?.name || inp.itemCode}
                    </span>
                    <span className="text-red-400 font-mono font-semibold">
                      -{inp.qty.toFixed(2)} / day
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
