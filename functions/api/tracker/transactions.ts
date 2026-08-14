// functions/api/tracker/transactions.ts
// Cloudflare Pages Function: riwayat transaksi per negara (pagination + resolve username).
const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

const DEFAULT_COUNTRY_ID = '6813b6d546e731854c7ac829'; // Indonesia
const MAX_PAGES = 500; // amankan dari infinite loop (~50.000 transaksi)

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };
}

function encodeInput(input: unknown): string {
  return encodeURIComponent(JSON.stringify(input));
}

async function fetchWareraTRPC(
  procedure: string,
  input: unknown,
  apiKey: string | null,
  timeoutMs = 8000,
): Promise<any | null> {
  const targets: { url: string; headers: Record<string, string> }[] = [
    {
      url: `https://api2.warera.io/trpc/${procedure}?input=${encodeInput(input)}`,
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
    },
    {
      url: `https://gateway.warerastats.io/trpc/${procedure}?input=${encodeInput(input)}`,
      headers: { 'X-API-Key': 'warerastats' },
    },
  ];

  for (const target of targets) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(target.url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...target.headers },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Try next upstream
    }
  }
  return null;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, { status: 204, headers: getCorsHeaders(request) });

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const headers = getCorsHeaders(request);
  const url = new URL(request.url);
  const countryId = url.searchParams.get('countryId') || DEFAULT_COUNTRY_ID;
  const transactionType = url.searchParams.get('transactionType') || undefined;
  const apiKey = request.headers.get('x-api-key');

  try {
    // Cache agregat per negara (5 menit) supaya refresh tidak mengulang ratusan request.
    const cacheKey = `tracker:${countryId}:${transactionType || 'all'}`;
    const cache = caches.default;
    const cacheUrl = new URL(request.url);
    cacheUrl.search = '';
    cacheUrl.pathname = `/__tracker_cache/${cacheKey.replace(/[^a-zA-Z0-9:_-]/g, '_')}`;

    const cachedRes = await cache.match(cacheUrl);
    if (cachedRes) {
      return new Response(cachedRes.body, {
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }

    const all: any[] = [];
    let cursor: string | null = null;
    let pagesFetched = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const input: Record<string, any> = { countryId, limit: 100 };
      if (transactionType) input.transactionType = transactionType;
      if (cursor) input.cursor = cursor;

      const json = await fetchWareraTRPC('transaction.getPaginatedTransactions', input, apiKey);
      const data = json?.result?.data;
      const items = Array.isArray(data?.items) ? data.items : [];
      all.push(...items);
      pagesFetched++;

      cursor = data?.nextCursor || null;
      if (!cursor) break;
    }

    // Kumpulkan user unik (sellerId + buyerId) untuk di-resolve ke username.
    const userIds = Array.from(
      new Set(
        all
          .flatMap((t) => [t?.sellerId, t?.buyerId])
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const userMap = new Map<string, string>();

    // Resolve username secara batch (concurrency 6) — paralel penuh untuk ratusan
    // user bikin rate-limit/timeout sehingga jatuh ke fallback ID.
    async function resolveUsername(uid: string): Promise<string> {
      try {
        const lite = await fetchWareraTRPC('user.getUserLite', { userId: uid }, apiKey, 4000);
        const name = lite?.result?.data?.username;
        if (name) return name;
        const full = await fetchWareraTRPC('user.getUserById', { userId: uid }, apiKey, 4000);
        const fullName = full?.result?.data?.username;
        if (fullName) return fullName;
      } catch {
        // lanjut fallback
      }
      return uid.slice(0, 8);
    }

    const CONCURRENCY = 6;
    let idx = 0;
    async function worker() {
      while (idx < userIds.length) {
        const uid = userIds[idx++];
        if (userMap.has(uid)) continue;
        userMap.set(uid, await resolveUsername(uid));
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, userIds.length) }, worker));

    const transactions = all.map((t: any) => ({
      _id: t?._id || '',
      itemCode: t?.itemCode || '',
      money: toNumber(t?.money),
      quantity: toNumber(t?.quantity),
      unitPrice: toNumber(t?.quantity) > 0 ? toNumber(t?.money) / toNumber(t?.quantity) : 0,
      sellerId: t?.sellerId || '',
      buyerId: t?.buyerId || '',
      sellerName: t?.sellerId ? (userMap.get(t.sellerId) || t.sellerId.slice(0, 8)) : '',
      buyerName: t?.buyerId ? (userMap.get(t.buyerId) || t.buyerId.slice(0, 8)) : '',
      sellerCountryId: t?.sellerCountryId || '',
      buyerCountryId: t?.buyerCountryId || '',
      transactionType: t?.transactionType || '',
      createdAt: t?.createdAt || t?.offerCreatedAt || '',
    }));

    const response = new Response(
      JSON.stringify({
        success: true,
        data: {
          countryId,
          fetchedAt: new Date().toISOString(),
          total: transactions.length,
          pagesFetched,
          transactions,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          ...headers,
        },
      },
    );

    // Simpan ke cache Cloudflare. `caches.default` tidak tersedia di semua
    // lingkungan (misal dev server) — tangkap exception-nya.
    try {
      const ctx = (context as any);
      if (ctx?.waitUntil) {
        ctx.waitUntil(cache.put(cacheUrl, response.clone()));
      } else {
        await cache.put(cacheUrl, response.clone());
      }
    } catch {
      // Cache tidak tersedia — return response apa adanya.
    }

    return response;
  } catch (err: any) {
    console.error('[CF Tracker Transactions Error]', err);
    return Response.json(
      { success: false, error: 'Gagal mengambil data transaksi negara' },
      { status: 502, headers },
    );
  }
};
