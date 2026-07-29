// functions/api/market/items.ts
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

  // 1. Coba official API dengan GET
  try {
    const targetUrl = 'https://api2.warera.io/trpc/itemTrading.getPrices';
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`WarEra API returned ${response.status}`);
    }

    const json = await response.json() as Record<string, any>; // ✅ FIX: cast ke object
    const enriched = {
      ...json,
      _meta: {
        fetchedAt: new Date().toISOString(),
        source: 'api2.warera.io',
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
    console.error('[CF Market] Official API failed:', err);

    // 2. Fallback ke warerastats.io
    try {
      const fallback = await fetch('https://api.warerastats.io/items', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)',
        },
      });

      if (!fallback.ok) throw new Error(`Fallback returned ${fallback.status}`);

      const data = await fallback.json() as Record<string, any>; // ✅ FIX: cast ke object
      const enriched = {
        ...data,
        _meta: {
          fetchedAt: new Date().toISOString(),
          source: 'api.warerastats.io (fallback)',
          warning: 'Official API unavailable',
        }
      };

      return Response.json(enriched, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });

    } catch (fallbackErr: any) {
      console.error('[CF Market] Fallback also failed:', fallbackErr);
      return Response.json(
        {
          error: 'Market data currently unavailable',
          _meta: { fetchedAt: new Date().toISOString() },
        },
        { status: 502 }
      );
    }
  }
};