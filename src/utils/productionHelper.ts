import { Company, CompanyFinancials, CompanyProductionResult, GlobalSettings, MaterialCostLine, SupplyChainNode } from '../types';
import { GAME_ITEMS, PRODUCTION_SKILL_VALUES, AUTOMATED_ENGINE_DAILY_PROD } from '../data/gameConfig';

/**
 * Calculates the production of a single company based on its settings and global player attributes.
 * This helper is exported and designed to be shared across the individual card rendering and 
 * the global supply chain allocator.
 */
export function calculateCompanyProduction(
  company: Company,
  globalSettings: GlobalSettings
): CompanyProductionResult {
  const item = GAME_ITEMS[company.itemCode];
  const isDisabled = Boolean(company.disabledAt || company.isDisabled || (company as any).disabled);
  
  if (!item || isDisabled) {
    return {
      companyId: company.id,
      companyName: company.name,
      itemCode: company.itemCode,
      itemType: item?.type || 'raw',
      productionPoints: 0,
      producedQty: 0,
      inputsNeeded: [],
    };
  }

  // Determine active values (override with local or use global/defaults)
  const skillLevel = globalSettings.productionSkillLevel;
  const productionPointsPerAction = PRODUCTION_SKILL_VALUES[skillLevel] ?? 10;
  
  const fidelityLevel = company.workerFidelity !== undefined ? company.workerFidelity : globalSettings.globalWorkerFidelity;
  const workerBonusMultiplier = 1 + fidelityLevel * 0.01; // 1% per fidelity

  const regionBonus = company.regionBonus !== undefined ? company.regionBonus : globalSettings.globalRegionBonus;
  const regionMultiplier = 1 + regionBonus;

  let totalPoints = 0;

  // 1. Manual Work Points
  if (company.mode === 'manual' || company.mode === 'both') {
    const manualPoints = company.manualActions * productionPointsPerAction * regionMultiplier;
    totalPoints += manualPoints;
  }

  // 2. Worker Work Points
  if (company.mode === 'manual' || company.mode === 'both') {
    const workerPoints = company.workerCount * company.workerActions * productionPointsPerAction * workerBonusMultiplier * regionMultiplier;
    totalPoints += workerPoints;
  }

  // 3. Automated Engine Points
  if (company.mode === 'automated' || company.mode === 'both') {
    if (company.engineLevel >= 1 && company.engineLevel <= 7) {
      const baseEnginePoints = AUTOMATED_ENGINE_DAILY_PROD[company.engineLevel - 1];
      const enginePoints = baseEnginePoints * regionMultiplier;
      totalPoints += enginePoints;
    }
  }

  // Base output quantity = points / item's production points requirement
  const producedQty = totalPoints / item.productionPoints;

  // Calculate inputs needed (only for product types)
  const inputsNeeded: { itemCode: string; qty: number }[] = [];
  if (item.type === 'product' && item.productionNeeds) {
    Object.entries(item.productionNeeds).forEach(([rawCode, ratio]) => {
      // ratio: e.g. 10 limestone per concrete.
      // So if concrete produced is 2.4, limestone needed is 2.4 * 10 = 24.
      inputsNeeded.push({
        itemCode: rawCode,
        qty: producedQty * ratio,
      });
    });
  }

  return {
    companyId: company.id,
    companyName: company.name,
    itemCode: company.itemCode,
    itemType: item.type,
    productionPoints: totalPoints,
    producedQty,
    inputsNeeded,
  };
}

/**
 * Connects all the user's companies together to build the full supply chain,
 * allocating raw materials to product-producing companies and calculating net yields.
 */
export function calculateSupplyChain(
  companies: Company[],
  globalSettings: GlobalSettings
): {
  companyResults: CompanyProductionResult[];
  supplyNodes: Record<string, SupplyChainNode>;
  selfSufficientResults: {
    companyResults: CompanyProductionResult[];
    supplyNodes: Record<string, SupplyChainNode>;
    overallEfficiency: number;
  };
} {
  // 1. Calculate base company productions (Ideal / Market Supply mode)
  const companyResults = companies.map(c => calculateCompanyProduction(c, globalSettings));

  // Initialize nodes for all active items
  const supplyNodes: Record<string, SupplyChainNode> = {};

  const ensureNode = (itemCode: string) => {
    if (!supplyNodes[itemCode]) {
      supplyNodes[itemCode] = {
        itemCode,
        produced: 0,
        consumed: 0,
        net: 0,
        sources: [],
        consumers: [],
        isDeficit: false,
        deficitQty: 0,
      };
    }
    return supplyNodes[itemCode];
  };

  // Populate node production and consumption
  companyResults.forEach(res => {
    const node = ensureNode(res.itemCode);
    node.produced += res.producedQty;
    if (res.producedQty > 0) {
      node.sources.push({ companyId: res.companyId, qty: res.producedQty });
    }

    res.inputsNeeded.forEach(input => {
      const inputNode = ensureNode(input.itemCode);
      inputNode.consumed += input.qty;
      inputNode.consumers.push({ companyId: res.companyId, qty: input.qty });
    });
  });

  // Calculate net balance and deficits
  Object.keys(supplyNodes).forEach(itemCode => {
    const node = supplyNodes[itemCode];
    node.net = node.produced - node.consumed;
    if (node.net < 0) {
      node.isDeficit = true;
      node.deficitQty = Math.abs(node.net);
    }
  });

  // 2. Scenario B: Self-Sufficient / Isolated Network Allocation (raw -> product logic)
  // Here, we scale down product company outputs if their raw material inputs cannot be fully supplied internally.
  // To solve this properly, we find the supply satisfaction ratio for each raw material.
  const rawSatisfaction: Record<string, number> = {};
  Object.keys(supplyNodes).forEach(itemCode => {
    const node = supplyNodes[itemCode];
    if (GAME_ITEMS[itemCode]?.type === 'raw') {
      if (node.consumed === 0) {
        rawSatisfaction[itemCode] = 1.0;
      } else {
        rawSatisfaction[itemCode] = Math.min(1.0, node.produced / node.consumed);
      }
    }
  });

  // Calculate scaled down results for each company
  let totalIdealPoints = 0;
  let totalActualPoints = 0;

  const selfSufficientCompanyResults = companies.map(company => {
    const idealRes = calculateCompanyProduction(company, globalSettings);
    const item = GAME_ITEMS[company.itemCode];
    
    totalIdealPoints += idealRes.productionPoints;

    if (!item || item.type !== 'product' || !item.productionNeeds) {
      // Raw material companies are always 100% efficient as they don't consume inputs
      totalActualPoints += idealRes.productionPoints;
      return idealRes;
    }

    // Determine the bottleneck input ratio
    let efficiency = 1.0;
    Object.keys(item.productionNeeds).forEach(rawCode => {
      const satisfaction = rawSatisfaction[rawCode] ?? 1.0;
      if (satisfaction < efficiency) {
        efficiency = satisfaction;
      }
    });

    const actualProducedQty = idealRes.producedQty * efficiency;
    const actualPoints = idealRes.productionPoints * efficiency;
    totalActualPoints += actualPoints;

    const actualInputsNeeded = idealRes.inputsNeeded.map(inp => ({
      itemCode: inp.itemCode,
      qty: inp.qty * efficiency,
    }));

    return {
      ...idealRes,
      producedQty: actualProducedQty,
      productionPoints: actualPoints,
      inputsNeeded: actualInputsNeeded,
    };
  });

  // Re-build nodes for self-sufficient scenario
  const selfSufficientNodes: Record<string, SupplyChainNode> = {};
  const ensureSSNode = (itemCode: string) => {
    if (!selfSufficientNodes[itemCode]) {
      selfSufficientNodes[itemCode] = {
        itemCode,
        produced: 0,
        consumed: 0,
        net: 0,
        sources: [],
        consumers: [],
        isDeficit: false,
        deficitQty: 0,
      };
    }
    return selfSufficientNodes[itemCode];
  };

  selfSufficientCompanyResults.forEach(res => {
    const node = ensureSSNode(res.itemCode);
    node.produced += res.producedQty;
    if (res.producedQty > 0) {
      node.sources.push({ companyId: res.companyId, qty: res.producedQty });
    }

    res.inputsNeeded.forEach(input => {
      const inputNode = ensureSSNode(input.itemCode);
      inputNode.consumed += input.qty;
      inputNode.consumers.push({ companyId: res.companyId, qty: input.qty });
    });
  });

  Object.keys(selfSufficientNodes).forEach(itemCode => {
    const node = selfSufficientNodes[itemCode];
    node.net = node.produced - node.consumed;
    // By definition, in self-sufficient mode, we shouldn't have deficits that scale down raw.
    // If net is slightly negative due to floating-point imprecision, round it to 0.
    if (node.net < -0.0001) {
      node.isDeficit = true;
      node.deficitQty = Math.abs(node.net);
    } else {
      node.net = Math.max(0, node.net);
    }
  });

  const overallEfficiency = totalIdealPoints > 0 ? (totalActualPoints / totalIdealPoints) * 100 : 100;

  return {
    companyResults,
    supplyNodes,
    selfSufficientResults: {
      companyResults: selfSufficientCompanyResults,
      supplyNodes: selfSufficientNodes,
      overallEfficiency,
    },
  };
}

/**
 * Menghitung sisi finansial (revenue, biaya bahan baku, net income) per company,
 * berdasarkan hasil produksi & node supply chain untuk SATU skenario tertentu
 * (baik mode "ideal"/market-buy maupun "self-sufficient").
 *
 * Prinsip alokasi:
 * - Untuk tiap item, porsi yang TIDAK terpakai internal (net = produced - consumed,
 *   dibatasi minimal 0) itulah yang benar2 terjual ke market. Dibagi proporsional
 *   ke tiap company produsen sesuai porsi produksinya.
 * - Untuk tiap bahan baku yang dibutuhkan sebuah company (inputsNeeded), porsi yang
 *   berstatus defisit di level portfolio (consumed > produced) dianggap dibeli dari
 *   market seharga harga pasar; sisanya dianggap disuplai gratis dari company lain
 *   di portfolio yang sama. Dibagi proporsional ke tiap company konsumen sesuai
 *   porsi kebutuhannya.
 *
 * Catatan: di mode "Self-Sufficient", producedQty produk sudah di-scale down supaya
 * tidak pernah defisit — jadi materialCost akan selalu 0 di mode itu (semua
 * tersuplai internal). Di mode "Market-Buy/Ideal", defisit dianggap dibeli dari
 * market sesuai harga real-time.
 */
export function calculateFinancials(
  companyResults: CompanyProductionResult[],
  supplyNodes: Record<string, SupplyChainNode>,
  marketPrices: Record<string, number>
): Record<string, CompanyFinancials> {
  const financials: Record<string, CompanyFinancials> = {};

  companyResults.forEach((res) => {
    const node = supplyNodes[res.itemCode];
    const price = marketPrices[res.itemCode] ?? 0;

    const totalProduced = node?.produced ?? 0;
    const producedShare = totalProduced > 0 ? res.producedQty / totalProduced : 0;

    // Total item yang benar2 dijual di level portfolio = surplus setelah dipakai internal.
    const totalSellable = Math.max(0, node?.net ?? res.producedQty);
    const soldQty = totalSellable * producedShare;
    const usedInternallyQty = Math.max(0, res.producedQty - soldQty);
    const grossRevenue = soldQty * price;

    const materialBreakdown: MaterialCostLine[] = res.inputsNeeded.map((inp) => {
      const inputNode = supplyNodes[inp.itemCode];
      const inputPrice = marketPrices[inp.itemCode] ?? 0;
      const totalConsumed = inputNode?.consumed ?? 0;
      // Porsi item ini yang statusnya defisit di level portfolio (harus dibeli market)
      const totalDeficit = Math.max(0, -(inputNode?.net ?? 0));
      const deficitShare = totalConsumed > 0 ? totalDeficit / totalConsumed : 0;

      const marketQty = inp.qty * deficitShare;
      const internalQty = inp.qty - marketQty;

      return {
        itemCode: inp.itemCode,
        qty: inp.qty,
        internalQty,
        marketQty,
        cost: marketQty * inputPrice,
      };
    });

    const materialCost = materialBreakdown.reduce((sum, m) => sum + m.cost, 0);

    financials[res.companyId] = {
      companyId: res.companyId,
      itemCode: res.itemCode,
      price,
      soldQty,
      usedInternallyQty,
      grossRevenue,
      materialBreakdown,
      materialCost,
      netIncome: grossRevenue - materialCost,
    };
  });

  return financials;
}