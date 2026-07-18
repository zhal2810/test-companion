import { GAME_ITEMS } from '../data/gameConfig';

export type TradeSignal = 'buy' | 'sell' | 'hold';

export interface ProductionMarginResult {
  itemCode: string;
  marketPrice: number;
  materialCost: number;
  laborCost: number;
  costPerUnit: number;
  marginPercent: number;
  missingInputPrices: string[]; // input item codes we couldn't price
}

// Rata-rata wage per PP di pasar WarEra. Ini ASUMSI, bukan angka pasti —
// wage riil tiap worker beda-beda (lihat contoh wage 0.132/pp yang pernah
// kita analisis). Dipakai sebagai estimasi biaya tenaga kerja per unit produksi.
export const DEFAULT_AVG_WAGE_PER_PP = 0.13;

// Ambang batas margin buat menentukan sinyal. Ini juga bisa disesuaikan —
// bukan angka baku dari game, murni heuristik ekonomi produksi.
const SELL_MARGIN_THRESHOLD = 20; // margin >= ini → banyak yang bakal mulai produksi → suplai naik → harga cenderung turun
const BUY_MARGIN_THRESHOLD = 5;   // margin <= ini → produksi nggak menguntungkan → suplai turun → harga cenderung naik

/**
 * Hitung margin ekonomi produksi 1 unit item, dibandingkan harga pasar saat ini.
 * costPerUnit = (bahan baku x harga pasar bahan baku) + (productionPoints x wage per PP)
 * Kalau salah satu harga bahan baku nggak diketahui, materialCost dihitung parsial
 * dan itemCode bahan yang hilang dicatat di missingInputPrices (biar transparan,
 * bukan diam-diam dianggap 0).
 */
export function calculateProductionMargin(
  itemCode: string,
  marketPrices: Record<string, number>,
  avgWagePerPP: number = DEFAULT_AVG_WAGE_PER_PP
): ProductionMarginResult | null {
  const item = GAME_ITEMS[itemCode];
  if (!item) return null;

  const marketPrice = marketPrices[itemCode];
  if (marketPrice == null || Number.isNaN(marketPrice)) return null;

  let materialCost = 0;
  const missingInputPrices: string[] = [];

  if (item.productionNeeds) {
    for (const [inputCode, qty] of Object.entries(item.productionNeeds)) {
      const inputPrice = marketPrices[inputCode];
      if (inputPrice == null || Number.isNaN(inputPrice)) {
        missingInputPrices.push(inputCode);
        continue;
      }
      materialCost += qty * inputPrice;
    }
  }

  const laborCost = item.productionPoints * avgWagePerPP;
  const costPerUnit = materialCost + laborCost;

  if (costPerUnit <= 0) return null;

  const marginPercent = ((marketPrice - costPerUnit) / costPerUnit) * 100;

  return {
    itemCode,
    marketPrice,
    materialCost,
    laborCost,
    costPerUnit,
    marginPercent,
    missingInputPrices,
  };
}

export interface OrderBookImbalance {
  bidVolume: number;
  askVolume: number;
  imbalanceRatio: number; // bidVolume / askVolume, >1 = tekanan beli, <1 = tekanan jual
  excludedOutliers: number;
}

/**
 * Hitung imbalance bid vs ask, buang outlier yang jelas manipulasi
 * (misal ada order jual di harga 999999). Outlier didefinisikan sebagai order
 * yang harganya menyimpang lebih dari `outlierMultiplier` kali dari harga pasar wajar.
 */
export function calculateOrderBookImbalance(
  orders: Array<{ type: 'buy' | 'sell'; price: number; quantity: number }>,
  referencePrice: number,
  outlierMultiplier: number = 5
): OrderBookImbalance {
  const upperBound = referencePrice * outlierMultiplier;
  const lowerBound = referencePrice / outlierMultiplier;

  let bidVolume = 0;
  let askVolume = 0;
  let excludedOutliers = 0;

  for (const order of orders) {
    if (order.price > upperBound || order.price < lowerBound || order.price <= 0) {
      excludedOutliers++;
      continue;
    }
    if (order.type === 'buy') bidVolume += order.quantity;
    else askVolume += order.quantity;
  }

  const imbalanceRatio = askVolume > 0 ? bidVolume / askVolume : (bidVolume > 0 ? Infinity : 1);

  return { bidVolume, askVolume, imbalanceRatio, excludedOutliers };
}

export interface TradeSignalResult {
  signal: TradeSignal;
  marginResult: ProductionMarginResult | null;
  orderBook: OrderBookImbalance | null;
  reasons: string[];
}

/**
 * Gabungkan margin produksi (sinyal utama) + order book (konfirmasi) jadi
 * satu rekomendasi Buy/Sell/Hold. TA klasik SENGAJA tidak dipakai — market
 * WarEra terlalu tipis & gampang dimanipulasi buat sinyal candle-pattern
 * dipercaya begitu saja.
 */
export function computeTradeSignal(
  marginResult: ProductionMarginResult | null,
  orderBook: OrderBookImbalance | null
): TradeSignalResult {
  const reasons: string[] = [];

  if (!marginResult) {
    return { signal: 'hold', marginResult, orderBook, reasons: ['Data produksi/harga bahan baku tidak lengkap.'] };
  }

  let signal: TradeSignal = 'hold';

  if (marginResult.marginPercent >= SELL_MARGIN_THRESHOLD) {
    signal = 'sell';
    reasons.push(`Margin produksi tinggi (+${marginResult.marginPercent.toFixed(1)}%) — berpotensi banyak yang mulai produksi, suplai naik.`);
  } else if (marginResult.marginPercent <= BUY_MARGIN_THRESHOLD) {
    signal = 'buy';
    reasons.push(`Margin produksi tipis/negatif (${marginResult.marginPercent.toFixed(1)}%) — produksi kurang menguntungkan, suplai berpotensi turun.`);
  } else {
    reasons.push(`Margin produksi netral (${marginResult.marginPercent.toFixed(1)}%).`);
  }

  if (marginResult.missingInputPrices.length > 0) {
    reasons.push(`⚠️ Harga bahan baku tidak lengkap: ${marginResult.missingInputPrices.join(', ')} — margin ini estimasi parsial.`);
  }

  // Order book sebagai KONFIRMASI, bukan sinyal utama — kalau bertentangan,
  // turunkan keyakinan jadi 'hold' daripada maksain sinyal yang kontradiktif.
  if (orderBook) {
    const bookLeansBuy = orderBook.imbalanceRatio > 1.3;
    const bookLeansSell = orderBook.imbalanceRatio < 0.77; // 1 / 1.3

    if (signal === 'buy' && bookLeansSell) {
      reasons.push('Order book malah lebih berat ke sisi jual — sinyal jadi kurang meyakinkan, diturunkan ke Hold.');
      signal = 'hold';
    } else if (signal === 'sell' && bookLeansBuy) {
      reasons.push('Order book malah lebih berat ke sisi beli — sinyal jadi kurang meyakinkan, diturunkan ke Hold.');
      signal = 'hold';
    } else if (signal === 'buy' && bookLeansBuy) {
      reasons.push('Dikonfirmasi: order book juga lebih berat ke sisi beli.');
    } else if (signal === 'sell' && bookLeansSell) {
      reasons.push('Dikonfirmasi: order book juga lebih berat ke sisi jual.');
    }

    if (orderBook.excludedOutliers > 0) {
      reasons.push(`${orderBook.excludedOutliers} order dibuang dari perhitungan karena terindikasi manipulasi harga (outlier).`);
    }
  }

  return { signal, marginResult, orderBook, reasons };
}
