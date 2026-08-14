import { getCandleHistory } from '../api/apiClient';

/**
 * Format harga item: item kecil (di bawah 1) 4 digit (0.0805),
 * item besar 3 digit (7.502, 22.429, 36.291).
 */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs < 1) return n.toFixed(4);
  return n.toFixed(3);
}

const PRICE_CACHE_KEY = 'warera_price_cache';
const CACHE_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

interface CachedPrice {
  price: number;
  timestamp: number;
  source: 'candle' | 'api';
  change24h?: number | null;
}

interface PriceCache {
  [itemCode: string]: CachedPrice;
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
