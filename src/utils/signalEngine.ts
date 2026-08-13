import { GAME_ITEMS } from '../data/gameConfig';
import { type Candle } from '../api/apiClient';

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

// Fallback kalau endpoint snapshot tidak tersedia atau format respons berubah.
export const DEFAULT_AVG_WAGE_PER_PP = 0.13;

export function extractAverageWagePerPP(
  snapshot: unknown,
  fallback: number = DEFAULT_AVG_WAGE_PER_PP
): number {
  if (!snapshot || typeof snapshot !== 'object') return fallback;

  const root = snapshot as Record<string, unknown>;
  const data = root.data && typeof root.data === 'object'
    ? root.data as Record<string, unknown>
    : root;
  const wage = data.wage;
  const allowedRange = wage && typeof wage === 'object'
    ? (wage as Record<string, unknown>).allowedRange
    : null;
  const average = allowedRange && typeof allowedRange === 'object'
    ? Number((allowedRange as Record<string, unknown>).average)
    : Number.NaN;

  return Number.isFinite(average) && average > 0 ? average : fallback;
}

// Ambang batas margin buat menentukan sinyal. Ini juga bisa disesuaikan —
// bukan angka baku dari game, murni heuristik ekonomi produksi.
const SELL_MARGIN_THRESHOLD = 2;  // margin >= ini → banyak yang bakal mulai produksi → suplai naik → harga cenderung turun
const BUY_MARGIN_THRESHOLD = -2;  // margin <= ini → produksi nggak menguntungkan → suplai turun → harga cenderung naik

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
      reasons.push(`${orderBook.excludedOutliers} order dibuang dari perhitungan karena terdeteksi sebagai outlier.`);
    }
  }

  return { signal, marginResult, orderBook, reasons };
}


export interface FairValueResult {
  fairValue: number;
  sma20: number | null;
  ema9: number | null;
  orderBookMid: number | null;
  deviationPercent: number;
}

export interface MarketSignalResult {
  signal: TradeSignal;
  fairValue: FairValueResult | null;
  marketPrice: number;
  bestBid: number | null;
  bestOffer: number | null;
  orderBook: OrderBookImbalance | null;
  reasons: string[];
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Market signal engine.
 *
 * BUY/HOLD/SELL hanya menjawab posisi harga pasar. Margin produksi sengaja
 * tidak dipakai sebagai penentu sinyal trading.
 *
 * Fair value = kombinasi SMA20, EMA9, dan midpoint BID/OFFER (jika tersedia).
 * Order book dan indikator teknikal hanya menjadi konfirmasi.
 */
export function computeMarketSignal(
  prices: number[],
  marketPrice: number,
  orderBook: OrderBookImbalance | null = null,
  bestBid: number | null = null,
  bestOffer: number | null = null
): MarketSignalResult {
  const reasons: string[] = [];
  const cleanPrices = (Array.isArray(prices) ? prices : [])
    .map(Number)
    .filter((p) => Number.isFinite(p) && p > 0);

  if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
    return {
      signal: 'hold',
      fairValue: null,
      marketPrice: 0,
      bestBid,
      bestOffer,
      orderBook,
      reasons: ['Harga pasar tidak tersedia.'],
      confidence: 'low',
    };
  }

  const smaValues = cleanPrices.length >= 20 ? calculateSMA(cleanPrices, 20) : [];
  const sma20Raw = smaValues.length ? smaValues[smaValues.length - 1] : Number.NaN;

  // EMA9 dihitung dari seluruh seri agar tidak terlalu sensitif terhadap jumlah candle.
  let ema9Raw = Number.NaN;
  if (cleanPrices.length > 0) {
    const k = 2 / (9 + 1);
    let ema = cleanPrices[0];
    for (let i = 1; i < cleanPrices.length; i++) {
      ema = cleanPrices[i] * k + ema * (1 - k);
    }
    ema9Raw = ema;
  }

  const orderBookMid =
    bestBid != null && bestOffer != null && bestBid > 0 && bestOffer > 0
      ? (bestBid + bestOffer) / 2
      : null;

  const components: Array<[number, number]> = [];
  if (Number.isFinite(sma20Raw) && sma20Raw > 0) components.push([sma20Raw, 0.50]);
  if (Number.isFinite(ema9Raw) && ema9Raw > 0) components.push([ema9Raw, 0.30]);
  if (orderBookMid != null) components.push([orderBookMid, 0.20]);

  // Fallback yang stabil jika data candle masih pendek.
  if (components.length === 0) components.push([marketPrice, 1]);

  const weightSum = components.reduce((sum, [, weight]) => sum + weight, 0);
  const fairValueRaw = components.reduce((sum, [value, weight]) => sum + value * weight, 0) / weightSum;
  const fairValue = fairValueRaw > 0 ? fairValueRaw : marketPrice;
  const deviationPercent = ((marketPrice - fairValue) / fairValue) * 100;

  const fair: FairValueResult = {
    fairValue,
    sma20: Number.isFinite(sma20Raw) ? sma20Raw : null,
    ema9: Number.isFinite(ema9Raw) ? ema9Raw : null,
    orderBookMid,
    deviationPercent,
  };

  const BUY_ZONE = -0.75;
  const SELL_ZONE = 0.75;

  let score = 0;

  if (deviationPercent <= BUY_ZONE) {
    score += 2;
    reasons.push(`Harga pasar ${Math.abs(deviationPercent).toFixed(2)}% di bawah Fair Value.`);
  } else if (deviationPercent >= SELL_ZONE) {
    score -= 2;
    reasons.push(`Harga pasar ${deviationPercent.toFixed(2)}% di atas Fair Value.`);
  } else {
    reasons.push(`Harga pasar berada dekat Fair Value (${deviationPercent >= 0 ? '+' : ''}${deviationPercent.toFixed(2)}%).`);
  }

  if (orderBook) {
    const ratio = orderBook.imbalanceRatio;
    if (ratio >= 1.20) {
      score += 1;
      reasons.push(`Bid lebih kuat dari Offer (${orderBook.bidVolume.toLocaleString('id-ID')} vs ${orderBook.askVolume.toLocaleString('id-ID')}).`);
    } else if (ratio <= 0.83) {
      score -= 1;
      reasons.push(`Offer lebih besar dari Bid (${orderBook.askVolume.toLocaleString('id-ID')} vs ${orderBook.bidVolume.toLocaleString('id-ID')}).`);
    } else {
      reasons.push(`Rasio Bid/Offer relatif seimbang (${Number.isFinite(ratio) ? ratio.toFixed(2) : '∞'}).`);
    }

    if (orderBook.excludedOutliers > 0) {
      reasons.push(`${orderBook.excludedOutliers} order dikeluarkan dari perhitungan karena terdeteksi sebagai outlier.`);
    }
  }

  // Technical indicators are confirmation only.
  if (cleanPrices.length >= 22) {
    const technical = computeTechnicalSignal(
      cleanPrices.map((close, index) => ({ close, time: index } as Candle))
    );

    if (technical.signal === 'buy') {
      score += 1;
      reasons.push(`Konfirmasi teknikal cenderung BUY (EMA/MA dan RSI).`);
    } else if (technical.signal === 'sell') {
      score -= 1;
      reasons.push(`Konfirmasi teknikal cenderung SELL (EMA/MA dan RSI).`);
    } else {
      reasons.push(`Konfirmasi teknikal masih netral (RSI ${technical.rsi.toFixed(1)}).`);
    }
  } else {
    reasons.push('Konfirmasi teknikal terbatas karena data candle belum cukup.');
  }

  let signal: TradeSignal = 'hold';
  if (deviationPercent <= BUY_ZONE && score >= 2) {
    signal = 'buy';
  } else if (deviationPercent >= SELL_ZONE && score <= -2) {
    signal = 'sell';
  }

  // Best bid/offer memperkuat penjelasan tanpa menjadi mesin tunggal.
  if (signal === 'buy' && bestOffer != null) {
    reasons.push(`Best Offer ${bestOffer.toFixed(3)} masih menjadi level masuk terdekat.`);
  } else if (signal === 'sell' && bestBid != null) {
    reasons.push(`Best Bid ${bestBid.toFixed(3)} menjadi level keluar terdekat.`);
  }

  const confidence =
    Math.abs(score) >= 4 ? 'high' :
    Math.abs(score) >= 3 ? 'medium' : 'low';

  return {
    signal,
    fairValue: fair,
    marketPrice,
    bestBid,
    bestOffer,
    orderBook,
    reasons,
    confidence,
  };
}

export interface TechnicalSignalResult {
  signal: 'buy' | 'sell' | 'hold';
  trend: 'uptrend' | 'downtrend' | 'sideways';
  currentPrice: number;
  ma9: number;
  ma21: number;
  ma20: number;
  rsi: number;
  reasons: string[];
  hasSufficientData: boolean;
}

export function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(Number.NaN);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += prices[i - j];
      }
      sma.push(sum / period);
    }
  }
  return sma;
}

export function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  if (prices.length < period + 1) {
    return Array(prices.length).fill(Number.NaN);
  }

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  for (let i = 0; i < period; i++) {
    rsi.push(Number.NaN);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const firstRS = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  const firstRSI = avgLoss === 0 ? 100 : 100 - (100 / (1 + firstRS));
  rsi.push(firstRSI);

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const currentRSI = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    rsi.push(currentRSI);
  }

  return rsi;
}

export function computeTechnicalSignal(candles: Candle[]): TechnicalSignalResult {
  const reasons: string[] = [];
  
  if (!candles || candles.length < 22) {
    return {
      signal: 'hold',
      trend: 'sideways',
      currentPrice: candles.length > 0 ? candles[candles.length - 1].close : 0,
      ma9: 0,
      ma21: 0,
      ma20: 0,
      rsi: 50,
      reasons: ['Data candle tidak cukup untuk menghitung MA/RSI (minimal butuh 22 candle).'],
      hasSufficientData: false
    };
  }

  // Ensure candles are sorted chronologically
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const prices = sorted.map(c => c.close);
  const currentPrice = prices[prices.length - 1];

  const ma9Values = calculateSMA(prices, 9);
  const ma21Values = calculateSMA(prices, 21);
  const ma20Values = calculateSMA(prices, 20);
  const rsiValues = calculateRSI(prices, 14);

  const idx = prices.length - 1;
  const currentMA9 = ma9Values[idx];
  const prevMA9 = ma9Values[idx - 1];
  const currentMA21 = ma21Values[idx];
  const prevMA21 = ma21Values[idx - 1];
  const currentMA20 = ma20Values[idx];
  const prevMA20 = ma20Values[idx - 1];
  const currentRSI = rsiValues[idx];
  const prevRSI = rsiValues[idx - 1];
  const prevPrevRSI = rsiValues[idx - 2];

  // 1. Trend analysis using MA20
  let trend: 'uptrend' | 'downtrend' | 'sideways' = 'sideways';
  const isAboveMA20 = currentPrice > currentMA20;
  const isMA20Rising = currentMA20 > prevMA20;
  const isBelowMA20 = currentPrice < currentMA20;
  const isMA20Falling = currentMA20 < prevMA20;

  if (isAboveMA20 && isMA20Rising) {
    trend = 'uptrend';
    reasons.push(`Trend: UPTREND (Harga ${currentPrice.toFixed(3)} di atas MA20, dan MA20 sedang naik).`);
  } else if (isBelowMA20 && isMA20Falling) {
    trend = 'downtrend';
    reasons.push(`Trend: DOWNTREND (Harga ${currentPrice.toFixed(3)} di bawah MA20, dan MA20 sedang turun).`);
  } else {
    trend = 'sideways';
    reasons.push(`Trend: SIDEWAYS / KONSOLIDASI (MA20 cenderung datar atau harga memotong garis).`);
  }

  // 2. MA Crossover Detection
  const goldenCross = currentMA9 > currentMA21 && prevMA9 <= prevMA21;
  const deathCross = currentMA9 < currentMA21 && prevMA9 >= prevMA21;

  if (goldenCross) {
    reasons.push(`Sinyal Crossover: GOLDEN CROSS terdeteksi! MA9 (${currentMA9.toFixed(3)}) memotong ke atas MA21 (${currentMA21.toFixed(3)}).`);
  } else if (deathCross) {
    reasons.push(`Sinyal Crossover: DEATH CROSS terdeteksi! MA9 (${currentMA9.toFixed(3)}) memotong ke bawah MA21 (${currentMA21.toFixed(3)}).`);
  } else {
    const shortAboveLong = currentMA9 > currentMA21;
    reasons.push(`Rasio MA: Momentum MA pendek (${currentMA9.toFixed(3)}) berada di ${shortAboveLong ? 'atas' : 'bawah'} MA panjang (${currentMA21.toFixed(3)}).`);
  }

  // 3. RSI analysis
  reasons.push(`RSI (14): ${currentRSI.toFixed(1)}`);
  const isOversold = currentRSI < 30;
  const isOverbought = currentRSI > 70;

  // Crossover exits from extreme zones (much stronger confirmation)
  const rsiCrossedUp30 = (currentRSI >= 30 && prevRSI < 30) || (currentRSI >= 30 && prevRSI >= 30 && prevPrevRSI < 30 && currentRSI > prevRSI);
  const rsiCrossedDown70 = (currentRSI <= 70 && prevRSI > 70) || (currentRSI <= 70 && prevRSI <= 70 && prevPrevRSI > 70 && currentRSI < prevRSI);

  if (rsiCrossedUp30) {
    reasons.push(`RSI keluar dari zona oversold (<30) ke atas (${currentRSI.toFixed(1)}) — sinyal pembalikan naik kuat.`);
  } else if (rsiCrossedDown70) {
    reasons.push(`RSI keluar dari zona overbought (>70) ke bawah (${currentRSI.toFixed(1)}) — sinyal pembalikan turun kuat.`);
  } else if (isOversold) {
    reasons.push(`RSI sangat oversold (<30) di angka ${currentRSI.toFixed(1)}. Menunggu konfirmasi keluar zona untuk buy.`);
  } else if (isOverbought) {
    reasons.push(`RSI sangat overbought (>70) di angka ${currentRSI.toFixed(1)}. Menunggu konfirmasi keluar zona untuk sell.`);
  }

  // 4. Combined signal strategy
  let signal: 'buy' | 'sell' | 'hold' = 'hold';

  // Buy conditions
  const buyUptrendAndRsiExit = trend === 'uptrend' && rsiCrossedUp30;
  const buyGoldenCrossAndSafeRsi = goldenCross && !isOverbought;

  // Sell conditions
  const sellDowntrendAndRsiExit = trend === 'downtrend' && rsiCrossedDown70;
  const sellDeathCrossAndSafeRsi = deathCross && !isOversold;

  if (buyUptrendAndRsiExit || buyGoldenCrossAndSafeRsi) {
    signal = 'buy';
    if (buyUptrendAndRsiExit) {
      reasons.push(`🔥 KONFIRMASI BELI: Harga Uptrend di atas MA20 dan RSI baru saja bangkit keluar dari area oversold.`);
    } else {
      reasons.push(`🔥 KONFIRMASI BELI: Terjadi Golden Cross MA dan RSI berada di area aman (${currentRSI.toFixed(1)}).`);
    }
  } else if (sellDowntrendAndRsiExit || sellDeathCrossAndSafeRsi) {
    signal = 'sell';
    if (sellDowntrendAndRsiExit) {
      reasons.push(`🚨 KONFIRMASI JUAL: Harga Downtrend di bawah MA20 dan RSI baru saja turun keluar dari area overbought.`);
    } else {
      reasons.push(`🚨 KONFIRMASI JUAL: Terjadi Death Cross MA dan RSI berada di area aman (${currentRSI.toFixed(1)}).`);
    }
  }

  // 5. Contradiction management
  if (signal === 'buy' && isOverbought) {
    signal = 'hold';
    reasons.push(`⚠️ Sinyal kontradiktif: Uptrend kuat tapi RSI jenuh beli (overbought: ${currentRSI.toFixed(1)}). Disarankan HOLD untuk menghindari puncak.`);
  } else if (signal === 'sell' && isOversold) {
    signal = 'hold';
    reasons.push(`⚠️ Sinyal kontradiktif: Downtrend kuat tapi RSI jenuh jual (oversold: ${currentRSI.toFixed(1)}). Disarankan HOLD untuk menghindari lembah.`);
  }

  return {
    signal,
    trend,
    currentPrice,
    ma9: currentMA9,
    ma21: currentMA21,
    ma20: currentMA20,
    rsi: currentRSI,
    reasons,
    hasSufficientData: true
  };
}
