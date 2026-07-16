import { GAME_ITEMS } from '../data/gameConfig';
import { BookOpen, HelpCircle } from 'lucide-react';

export default function TemplateGuidePanel() {
  const products = Object.values(GAME_ITEMS).filter((it) => it.type === 'product');

  return (
    <div className="bg-[#0F1117] border border-slate-800 rounded-xl p-5 shadow-lg text-slate-100" id="recipe-guide-panel">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
        <BookOpen className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-semibold tracking-tight text-white">Era Game Production Recipe Blueprint</h2>
      </div>

      <p className="text-xs text-slate-400 mb-4">
        Below are the requirements needed to process raw materials into refined goods in the Era game. 
        Each product requires specific raw items per unit produced.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {products.map((prod) => (
          <div key={prod.code} className="bg-[#0A0C10] border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-emerald-400">{prod.name}</span>
                <span className="text-[10px] bg-[#161920] border border-slate-800/60 text-slate-400 px-1.5 py-0.5 rounded font-mono uppercase">
                  {prod.rarity}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 italic">
                Req. <span className="font-mono">{prod.productionPoints}</span> prod points/unit
              </p>
            </div>

            {prod.productionNeeds && (
              <div className="mt-3 border-t border-slate-800/60 pt-2 flex flex-col gap-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wide font-bold">Needs per unit:</span>
                {Object.entries(prod.productionNeeds).map(([rawCode, amount]) => {
                  const rawItem = GAME_ITEMS[rawCode];
                  return (
                    <div key={rawCode} className="flex justify-between text-xs text-slate-400">
                      <span>↳ {rawItem?.name || rawCode}</span>
                      <span className="font-mono font-bold text-slate-300">{amount} units</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
