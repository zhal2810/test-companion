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
const CACHE_VALIDITY_MS = 30 * 1000; // 30 detik - realtime

interface CachedPrice {
  price: number;
  timestamp: number;
  source: 'candle' | 'api' | 'live' | 'snapshot';
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
  source: 'candle' | 'api' | 'live' | 'snapshot' = 'api'
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
 * Get consistent price - realtime: live transaction > snapshot > candle > fallback
 * Cache cuma 30 detik biar live trade 3.589 langsung kepakai bukan 3.578
 */
export async function getConsistentPrice(
  itemCode: string,
  fallbackPrice: number
): Promise<{ price: number; source: 'candle' | 'cache' | 'api' | 'fallback' | 'live' | 'snapshot' }> {
  // Check cache first (30s)
  const cached = getCachedPrice(itemCode);
  if (cached) {
    return { price: cached.price, source: cached.source as any };
  }

  // 1. Coba live transaction terbaru (paling realtime) - /api/market/offers/:item
  try {
    const liveRes = await fetch(`/api/market/offers/${encodeURIComponent(itemCode)}?limit=1`);
    if (liveRes.ok) {
      const ct = liveRes.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json: any = await liveRes.json();
        const tx = Array.isArray(json?.data) ? json.data[0] : null;
        const livePrice = tx ? Number(tx.price || (tx.money && tx.quantity ? tx.money/tx.quantity : 0)) : 0;
        const liveTime = tx?.createdAt ? new Date(tx.createdAt).getTime() : 0;
        // pakai kalau transaksi < 15 menit dan harga valid
        if (Number.isFinite(livePrice) && livePrice > 0 && liveTime > 0 && (Date.now() - liveTime) < 15*60*1000) {
          setCachedPrice(itemCode, livePrice, 'live');
          return { price: livePrice, source: 'live' };
        }
        // fallback: kalau ada price tapi time jauh tetap pakai kalau beda jauh dari fallback (market bergerak)
        if (Number.isFinite(livePrice) && livePrice > 0 && Math.abs(livePrice - fallbackPrice)/fallbackPrice > 0.005) {
          setCachedPrice(itemCode, livePrice, 'live');
          return { price: livePrice, source: 'live' };
        }
      }
    }
  } catch {}

  // 2. Coba snapshot pulse (real-time avg) - /api/market/pulse-snapshot
  try {
    const snapRes = await fetch('/api/market/pulse-snapshot');
    if (snapRes.ok) {
      const json: any = await snapRes.json();
      const snapData = json?.data ?? json;
      const snapPrices = snapData?.prices;
      if (snapPrices && typeof snapPrices === 'object') {
        const raw = (snapPrices as any)[itemCode] ?? (snapPrices as any)[itemCode.toLowerCase()];
        const snapPrice = typeof raw === 'number' ? raw : Number((raw as any)?.price ?? (raw as any)?.avg ?? 0);
        if (Number.isFinite(snapPrice) && snapPrice > 0) {
          // pakai snapshot kalau lebih fresh dari candle (beda >0.3%)
          if (Math.abs(snapPrice - fallbackPrice)/Math.max(fallbackPrice,1) > 0.003) {
            setCachedPrice(itemCode, snapPrice, 'snapshot');
            return { price: snapPrice, source: 'snapshot' };
          }
        }
      }
    }
  } catch {}

  // 3. Fallback ke candle (week) - agregat 1H, bisa telat
  try {
    const candleRes = await getCandleHistory(itemCode, 'week');
    if (candleRes.success && candleRes.data.length > 0) {
      const sorted = [...candleRes.data].sort((a,b)=> Number(a.time)-Number(b.time));
      const lastCandle = sorted[sorted.length - 1];
      const candlePrice = Number(lastCandle.close) || fallbackPrice;
      setCachedPrice(itemCode, candlePrice, 'candle');
      return { price: candlePrice, source: 'candle' };
    }
  } catch {}

  // 4. Final fallback
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
