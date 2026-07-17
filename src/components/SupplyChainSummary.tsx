import { useState, useEffect, useMemo } from 'react';
import { Company, GlobalSettings, SupplyChainNode, CompanyFinancials } from '../types';
import { GAME_ITEMS } from '../data/gameConfig';
import { calculateSupplyChain, calculateFinancials } from '../utils/productionHelper';
import { getItemPrices } from '../api/apiClient';
import { CheckCircle2, AlertTriangle, HelpCircle, ArrowRight, Activity, TrendingUp, TrendingDown, Layers, Info, DollarSign } from 'lucide-react';

interface SupplyChainSummaryProps {
  companies: Company[];
  globalSettings: GlobalSettings;
}

export default function SupplyChainSummary({ companies, globalSettings }: SupplyChainSummaryProps) {
  const [allocationMode, setAllocationMode] = useState<'ideal' | 'sufficient'>('sufficient');
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    getItemPrices().then((res) => {
      if (res.success) setMarketPrices(res.data);
    });
  }, []);

  // Compute both supply chain results
  const chain = calculateSupplyChain(companies, globalSettings);

  // Decide which node and result to display based on selected mode
  const activeNodes = allocationMode === 'ideal' ? chain.supplyNodes : chain.selfSufficientResults.supplyNodes;
  const activeCompanyResults = allocationMode === 'ideal' ? chain.companyResults : chain.selfSufficientResults.companyResults;
  const selfSufficiencyEfficiency = chain.selfSufficientResults.overallEfficiency;

  // Financials untuk skenario yang sedang aktif — recompute tiap kali mode/harga/companies berubah.
  const financials = useMemo(
    () => calculateFinancials(activeCompanyResults, activeNodes, marketPrices),
    [activeCompanyResults, activeNodes, marketPrices]
  );
  const portfolioNetIncome = Object.values(financials).reduce((sum, f: CompanyFinancials) => sum + f.netIncome, 0);

  const activeNodesList = Object.values(activeNodes).sort((a, b) => {
    // Sort raw materials first, then products
    const itemA = GAME_ITEMS[a.itemCode];
    const itemB = GAME_ITEMS[b.itemCode];
    if (itemA?.type !== itemB?.type) {
      return itemA?.type === 'raw' ? -1 : 1;
    }
    return a.itemCode.localeCompare(b.itemCode);
  });

  return (
    <div className="bg-[#0F1117] border border-slate-800 rounded-xl p-5 shadow-lg text-slate-100 flex flex-col gap-6" id="supply-chain-summary">
      
      {/* Header and Toggle Mode */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold tracking-tight text-white">Parent Supply Chain Allocator</h2>
            <span className={`flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${portfolioNetIncome >= 0 ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/40' : 'text-red-400 bg-red-950/20 border-red-900/40'}`}>
              <DollarSign className="w-3 h-3" />
              {portfolioNetIncome >= 0 ? '+' : ''}{portfolioNetIncome.toFixed(2)}/hari
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Connects and tracks production chains across all your companies.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex bg-[#0A0C10] p-1 rounded-lg border border-slate-800 self-start md:self-auto">
          <button
            onClick={() => setAllocationMode('sufficient')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              allocationMode === 'sufficient'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            id="mode-sufficient-btn"
          >
            Self-Sufficient Mode (Isolated)
          </button>
          <button
            onClick={() => setAllocationMode('ideal')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              allocationMode === 'ideal'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            id="mode-ideal-btn"
          >
            Market-Buy Mode (Ideal)
          </button>
        </div>
      </div>

      {/* Info Notice based on Mode */}
      <div className="p-3.5 rounded-lg border text-xs leading-relaxed flex items-start gap-3 bg-[#0A0C10] border-slate-800/80">
        <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div>
          {allocationMode === 'sufficient' ? (
            <p>
              <strong className="text-slate-200">Self-Sufficient Mode (Isolated Network):</strong> Product companies only produce what can be supported by your raw materials. Outputs scale down proportionally if raw materials are deficient. Total portfolio self-sufficiency efficiency is <strong className="text-emerald-400 font-mono">{selfSufficiencyEfficiency.toFixed(1)}%</strong>.
            </p>
          ) : (
            <p>
              <strong className="text-slate-200">Market-Buy Mode (Ideal Output):</strong> Assumes any raw material deficit is purchased from the market. Companies operate at 100% capacity. This displays maximum potential yield and indicates exactly what to buy to maintain full operations.
            </p>
          )}
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-800 rounded-lg text-slate-500">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No companies registered yet. Add companies above to populate the supply chain flow.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" id="chain-grid">
          
          {/* List of active item flows */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Item Balance Dashboard</h3>
            <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto pr-1">
              {activeNodesList.map((node) => {
                const item = GAME_ITEMS[node.itemCode];
                const isProduct = item?.type === 'product';
                const hasDeficit = node.net < -0.001;

                return (
                  <div
                    key={node.itemCode}
                    className={`p-4 rounded-xl border transition ${
                      hasDeficit
                        ? 'bg-red-950/10 border-red-900/40'
                        : node.net > 0.001
                        ? 'bg-emerald-950/10 border-emerald-900/30'
                        : 'bg-[#0A0C10] border-slate-800'
                    }`}
                    id={`balance-node-${node.itemCode}`}
                  >
                    {/* Item header */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${isProduct ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span className="font-bold text-sm text-slate-200">{item?.name || node.itemCode}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded capitalize font-mono">
                          {item?.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasDeficit ? (
                          <span className="text-red-400 font-mono font-bold text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Deficit {node.net.toFixed(1)}/day
                          </span>
                        ) : node.net > 0.001 ? (
                          <span className="text-emerald-400 font-mono font-bold text-xs flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" /> Surplus +{node.net.toFixed(1)}/day
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold text-xs flex items-center gap-1">
                            Balanced
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Numeric breakdown bar */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs border-y border-slate-800/40 py-2 my-2.5 bg-[#0F1117]/60 rounded-lg">
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-semibold">Produced</div>
                        <div className="text-slate-300 font-mono font-bold">+{node.produced.toFixed(1)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-semibold">Consumed</div>
                        <div className="text-slate-300 font-mono font-bold">-{node.consumed.toFixed(1)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase font-semibold">Net Balance</div>
                        <div className={`font-mono font-bold ${hasDeficit ? 'text-red-400' : node.net > 0.001 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {node.net > 0 ? '+' : ''}{node.net.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    {/* Producers and Consumers list */}
                    <div className="flex flex-col gap-1.5 text-[11px] mt-2 text-slate-400">
                      {node.sources.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-500 font-medium">Produced by:</span>
                          {node.sources.map((src) => {
                            const comp = companies.find(c => c.id === src.companyId);
                            return (
                              <div key={src.companyId} className="flex justify-between pl-2">
                                <span>↳ {comp?.name || 'Company'}</span>
                                <span className="text-emerald-400 font-mono font-medium">+{src.qty.toFixed(1)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {node.consumers.length > 0 && (
                        <div className="flex flex-col gap-0.5 mt-1.5">
                          <span className="text-slate-500 font-medium">Consumed by:</span>
                          {node.consumers.map((con) => {
                            const comp = companies.find(c => c.id === con.companyId);
                            return (
                              <div key={con.companyId} className="flex justify-between pl-2">
                                <span>↳ {comp?.name || 'Company'}</span>
                                <span className="text-red-400 font-mono font-medium">-{con.qty.toFixed(1)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rantai Alokasi Rantai Produksi Visualizer */}
          <div className="bg-[#0A0C10] rounded-xl p-5 border border-slate-800 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Production Chain Dependencies</h3>
            
            <div className="flex flex-col gap-4 max-h-[480px] overflow-y-auto">
              {activeCompanyResults.map((res) => {
                const companyObj = companies.find(c => c.id === res.companyId);
                const item = GAME_ITEMS[res.itemCode];
                if (!item) return null;

                const isProduct = item.type === 'product';

                return (
                  <div key={res.companyId} className="bg-[#161920] border border-slate-800 p-4 rounded-lg flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">{res.companyName}</span>
                      <span className="text-[10px] text-indigo-400 font-semibold uppercase bg-indigo-950/40 px-2 py-0.5 border border-indigo-900/30 rounded font-mono">
                        {companyObj?.mode}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 bg-[#0A0C10] p-2.5 rounded-lg border border-slate-800/60">
                      {isProduct && item.productionNeeds ? (
                        <div className="flex-1 flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">Needs</span>
                          {Object.entries(item.productionNeeds).map(([rawCode, ratio]) => {
                            const rawItem = GAME_ITEMS[rawCode];
                            const rawDemand = res.producedQty * ratio;
                            const isMet = (activeNodes[rawCode]?.produced ?? 0) >= (activeNodes[rawCode]?.consumed ?? 0);
                            
                            return (
                              <div key={rawCode} className="flex items-center justify-between text-xs">
                                <span className="text-slate-400 font-medium">{rawItem?.name}</span>
                                <span className={isMet ? 'text-emerald-400 font-mono font-semibold' : 'text-red-400 font-mono font-semibold'}>
                                  {rawDemand.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex-1">
                          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider font-mono">Independent Raw Quarry</span>
                          <p className="text-xs text-slate-400 mt-0.5">Produces base resources from natural deposits.</p>
                        </div>
                      )}

                      <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />

                      <div className="flex-1 text-right">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Yield</span>
                        <div className="text-xs text-slate-200 font-bold truncate">{item.name}</div>
                        <div className="text-sm font-mono font-bold text-emerald-400">
                          +{res.producedQty.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    {/* Financial Breakdown */}
                    {(() => {
                      const fin = financials[res.companyId];
                      if (!fin) return null;
                      return (
                        <div className="bg-[#0A0C10] p-2.5 rounded-lg border border-slate-800/60 flex flex-col gap-1.5 text-xs">
                          {fin.usedInternallyQty > 0.001 && (
                            <div className="flex justify-between text-slate-400">
                              <span>Used Internally</span>
                              <span className="font-mono text-amber-400">-{fin.usedInternallyQty.toFixed(1)}/hari</span>
                            </div>
                          )}
                          <div className="flex justify-between text-slate-400">
                            <span>Gross Income ({fin.soldQty.toFixed(1)} sold @ {fin.price.toFixed(3)})</span>
                            <span className="font-mono text-emerald-400">+{fin.grossRevenue.toFixed(3)}</span>
                          </div>
                          {fin.materialBreakdown.length > 0 && (
                            <>
                              <div className="flex justify-between text-slate-400">
                                <span>Material Costs</span>
                                <span className="font-mono text-red-400">-{fin.materialCost.toFixed(3)}</span>
                              </div>
                              {fin.materialBreakdown.map((m) => (
                                <div key={m.itemCode} className="flex justify-between pl-2 text-[10.5px] text-slate-500">
                                  <span>↳ {GAME_ITEMS[m.itemCode]?.name || m.itemCode}
                                    {m.internalQty > 0.001 ? ` (internal ${m.internalQty.toFixed(1)})` : ''}
                                    {m.marketQty > 0.001 ? ` (market ${m.marketQty.toFixed(1)})` : ''}
                                  </span>
                                  <span className={m.cost > 0.001 ? 'text-red-400 font-mono' : 'text-emerald-400 font-mono'}>
                                    {m.cost > 0.001 ? `-${m.cost.toFixed(3)}` : 'Free'}
                                  </span>
                                </div>
                              ))}
                            </>
                          )}
                          <div className="flex justify-between font-bold pt-1.5 border-t border-slate-800/60">
                            <span className="text-slate-300">Net Income</span>
                            <span className={`font-mono ${fin.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {fin.netIncome >= 0 ? '+' : ''}{fin.netIncome.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}