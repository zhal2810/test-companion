// functions/api/market/items.ts
// Harga pasar per item — dari API komunitas warera.realmarijn.nl (satu-satunya).
import { callCommunity } from '../_shared/community';

export const onRequestGet: PagesFunction = async (context) => {
  const cache = caches.default;
  const cacheKey = new URL(context.request.url);
  const cached = await cache.match(cacheKey);

  if (cached) {
    const data = await cached.json() as Record<string, any>; // ✅ FIX: cast ke object
    return Response.json({
      ...data,
      _meta: {
        ...(data._meta || {}),
        cached: true,
        servedFrom: 'cf-cache',
      }
    });
  }

  // 1. API komunitas (POST /api/proxy/itemTrading.getPrices)
  try {
    const json = await callCommunity('itemTrading.getPrices', {});
    if (!json?.result?.data) {
      throw new Error('Community API returned no price map');
    }

    const enriched = {
      result: { data: json.result.data },
      _meta: {
        fetchedAt: new Date().toISOString(),
        source: 'warera.realmarijn.nl',
        cached: false,
      }
    };

    // Simpan ke Cloudflare Cache (60 detik)
    const cacheResponse = new Response(JSON.stringify(enriched), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
    context.waitUntil(cache.put(cacheKey, cacheResponse.clone()));

    return cacheResponse;

  } catch (err: any) {
    console.error('[CF Market] Community API failed:', err);

    return Response.json(
      {
        error: 'Market data currently unavailable',
        _meta: { fetchedAt: new Date().toISOString() },
      },
      { status: 502 }
    );
  }
};
