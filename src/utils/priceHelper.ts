import { getCandleHistory } from '../api/apiClient';

const PRICE_CACHE_KEY = 'warera_price_cache';
const CACHE_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

interface CachedPrice {
  price: number;
  timestamp: number;
  source: 'candle' | 'api';
}

interface PriceCache {
  [itemCode: string]: CachedPrice;
}

/**
 * Format harga dengan presisi otomatis mengikuti besaran nilainya.
 *
 * Item mahal (mis. ~3.675) cukup 2 desimal supaya tidak berkedip di digit
 * terakhir; item murah (mis. iron 0.0877) tetap perlu 3-4 desimal agar
 * pergerakan harga tidak hilang.
 */
export function formatPriceAdaptive(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1000) return value.toFixed(1);
  if (abs >= 100) return value.toFixed(2);
  if (abs >= 1) return value.toFixed(2);
  if (abs >= 0.1) return value.toFixed(3);
  if (abs >= 0.01) return value.toFixed(3);
  if (abs >= 0.001) return value.toFixed(4);
  return value.toFixed(5);
}

/**
 * Get cached price if exists and still valid
 */
export function getCachedPrice(itemCode: string): CachedPrice | null {
  try {
    const cache: PriceCache = JSON.parse(
      localStorage.getItem(PRICE_CACHE_KEY) || '{}'
    );
    
    const cached = cache[itemCode];
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > CACHE_VALIDITY_MS) {
      // Cache expired, clear it
      delete cache[itemCode];
      localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(cache));
      return null;
    }

    return cached;
  } catch (e) {
    return null;
  }
}

/**
 * Set price in cache
 */
export function setCachedPrice(
  itemCode: string,
  price: number,
  source: 'candle' | 'api' = 'api'
): void {
  try {
    const cache: PriceCache = JSON.parse(
      localStorage.getItem(PRICE_CACHE_KEY) || '{}'
    );

    cache[itemCode] = {
      price,
      timestamp: Date.now(),
      source,
    };

    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    // Ignore cache write errors
  }
}

/**
 * Get consistent price - use candle if available, else cache, else fallback to provided price
 * This ensures price consistency across all views
 */
export async function getConsistentPrice(
  itemCode: string,
  fallbackPrice: number
): Promise<{ price: number; source: 'candle' | 'cache' | 'api' | 'fallback' }> {
  // Check cache first (includes recently fetched candles)
  const cached = getCachedPrice(itemCode);
  if (cached) {
    return { price: cached.price, source: cached.source };
  }

  // Try to fetch latest candle as source of truth
  try {
    const candleRes = await getCandleHistory(itemCode, 'day');
    if (candleRes.success && candleRes.data.length > 0) {
      const lastCandle = candleRes.data[candleRes.data.length - 1];
      const candlePrice = lastCandle.close;

      // Cache the candle price
      setCachedPrice(itemCode, candlePrice, 'candle');

      return { price: candlePrice, source: 'candle' };
    }
  } catch (e) {
    // Candle fetch failed, continue to fallback
  }

  // Use provided price as final fallback
  setCachedPrice(itemCode, fallbackPrice, 'api');
  return { price: fallbackPrice, source: 'fallback' };
}

/**
 * Clear all price cache
 */
export function clearPriceCache(): void {
  try {
    localStorage.removeItem(PRICE_CACHE_KEY);
  } catch (e) {
    // ignore
  }
}

/**
 * Get cache hit rate (for debugging)
 */
export function getCacheStats(): { total: number; hitRate: string } {
  try {
    const cache: PriceCache = JSON.parse(
      localStorage.getItem(PRICE_CACHE_KEY) || '{}'
    );
    return {
      total: Object.keys(cache).length,
      hitRate: `${Object.keys(cache).length} items cached`
    };
  } catch {
    return { total: 0, hitRate: '0 items cached' };
  }
}
