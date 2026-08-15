// functions/api/tracker/transactions.ts
// Cloudflare Pages Function: riwayat transaksi per negara (pagination + resolve username).
const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

const DEFAULT_COUNTRY_ID = '6813b6d546e731854c7ac829'; // Indonesia
const MAX_PAGES = 500; // amankan dari infinite loop (~50.000 transaksi)
const RAW_TTL_SECONDS = 900; // cache raw transactions 15 menit
const USERNAME_TTL_SECONDS = 86400; // cache username 24 jam
// Kuota subrequest Cloudflare: 50 (Free) / 1000 (Paid). Nilai default
// konservatif ke plan Free, tapi bisa di-override lewat env SUBREQUEST_LIMIT.
// Budget resolusi dihitung adaptif: kuota dikurangi jumlah halaman yang
// benar-benar di-paginate pada invokasi ini. Dipakai bersama cache username
// persisten supaya makin hangat tiap kali halaman dibuka.
const MAX_NEW_RESOLUTIONS = 40;
const CONCURRENCY = 5;

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
  const targets: { url: string; headers: Record<string, string> }[] = [];
  const isUserProc = procedure.startsWith('user.');
  if (isUserProc) {
    // Untuk resolve username, gateway dulu — bentuknya sudah terverifikasi
    // mengembalikan result.data.username; api2 di beberapa kasus menolak / beda bentuk.
    targets.push({
      url: `https://gateway.warerastats.io/trpc/${procedure}?input=${encodeInput(input)}`,
      headers: { 'X-API-Key': 'warerastats' },
    });
    targets.push({
      url: `https://api2.warera.io/trpc/${procedure}?input=${encodeInput(input)}`,
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
    });
  } else {
    targets.push({
      url: `https://api2.warera.io/trpc/${procedure}?input=${encodeInput(input)}`,
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
    });
    targets.push({
      url: `https://gateway.warerastats.io/trpc/${procedure}?input=${encodeInput(input)}`,
      headers: { 'X-API-Key': 'warerastats' },
    });
  }

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

// Baca/masukin JSON ke Cloudflare Cache API. Operasi cache TIDAK dihitung
// sebagai subrequest — aman dipakai banyak.
async function cacheGetJSON(cache: Cache, key: URL): Promise<any | null> {
  try {
    const res = await cache.match(key);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function cachePutJSON(
  cache: Cache,
  key: URL,
  value: any,
  maxAgeSeconds: number,
  waitUntil: any,
): void {
  const res = new Response(JSON.stringify(value), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAgeSeconds}`,
    },
  });
  try {
    if (waitUntil) {
      waitUntil(cache.put(key, res));
    } else {
      cache.put(key, res);
    }
  } catch {
    // Cache tidak tersedia — abaikan.
  }
}

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, { status: 204, headers: getCorsHeaders(request) });

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const waitUntil = (context as any)?.waitUntil;
  const env = (context as any)?.env || {};
  const subrequestLimit = Number(env.SUBREQUEST_LIMIT) || 50;
  const headers = getCorsHeaders(request);
  const url = new URL(request.url);
  const countryId = url.searchParams.get('countryId') || DEFAULT_COUNTRY_ID;
  const transactionType = url.searchParams.get('transactionType') || undefined;
  const apiKey = request.headers.get('x-api-key');

  try {
    const cache = caches.default;
    const base = new URL(request.url);
    base.search = '';
    const slug = `tracker:${countryId}:${transactionType || 'all'}`.replace(/[^a-zA-Z0-9:_-]/g, '_');

    // Bypass semua cache jika diminta force (tombol Refresh kirim ?_=<timestamp>).
    const forceRefresh = url.searchParams.has('_');

    // L1: response agregat (5 menit) — klien dapat cepat tanpa kerja tambahan.
    const aggKey = new URL(base);
    aggKey.pathname = `/__tracker_agg/${slug}`;
    if (!forceRefresh) {
      const aggHit = await cacheGetJSON(cache, aggKey);
      if (aggHit) {
        return Response.json(aggHit, {
          headers: { 'Content-Type': 'application/json', ...headers },
        });
      }
    }

    // L2: raw transactions (15 menit) — hindari pagination ulang tiap request,
    // supaya kuota subrequest dipakai untuk resolve username, bukan pagination.
    const rawKey = new URL(base);
    rawKey.pathname = `/__tracker_raw/${slug}`;
    let all: any[] | null = null;
    let pagesFetched = 0;
    let pagesFetchedThisRun = 0;
    if (!forceRefresh) {
      const rawHit = await cacheGetJSON(cache, rawKey);
      if (rawHit?.items) {
        all = rawHit.items;
        pagesFetched = rawHit.pagesFetched || 0;
      }
    }

    if (!all) {
      all = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const input: Record<string, any> = { countryId, limit: 100 };
        if (transactionType) input.transactionType = transactionType;
        if (cursor) input.cursor = cursor;

        const json = await fetchWareraTRPC('transaction.getPaginatedTransactions', input, apiKey);
        const data = json?.result?.data;
        const items = Array.isArray(data?.items) ? data.items : [];
        all.push(...items);
        pagesFetched++;
        pagesFetchedThisRun++;

        cursor = data?.nextCursor || null;
        if (!cursor) break;
      }
      cachePutJSON(cache, rawKey, { items: all, pagesFetched }, RAW_TTL_SECONDS, waitUntil);
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
    const toResolve: string[] = [];

    // L3: username cache per-uid (24 jam). Yang belum ada → antre resolve.
    for (const uid of userIds) {
      const unameKey = new URL(base);
      unameKey.pathname = `/__tracker_user/${uid}`;
      const hit = await cacheGetJSON(cache, unameKey);
      if (hit?.username) {
        userMap.set(uid, hit.username);
      } else {
        toResolve.push(uid);
      }
    }

    // Resolve hanya user BARU yang belum pernah di-cache, dibatasi budget
    // adaptif supaya tidak melebihi kuota subrequest per invocation:
    //   budget = SUBREQUEST_LIMIT - halaman yang di-paginate pada invokasi ini
    // Sisa yang belum ter-resolve di-cache sebagai "pending" (tidak di-cache
    // namanya), sehingga request berikutnya (raw cache warm → 0 halaman) punya
    // budget penuh untuk melanjutkan.
    const resolveBudget = Math.max(
      0,
      Math.min(MAX_NEW_RESOLUTIONS, subrequestLimit - pagesFetchedThisRun),
    );
    const newOnes = toResolve.slice(0, Math.min(resolveBudget, toResolve.length));
    let idx = 0;

    async function resolveOne(uid: string): Promise<string> {
      // Satu pass, tanpa retry ganda — hemat subrequest.
      const lite = await fetchWareraTRPC('user.getUserLite', { userId: uid }, apiKey, 4000);
      const name = lite?.result?.data?.username;
      if (name) return name;
      const full = await fetchWareraTRPC('user.getUserById', { userId: uid }, apiKey, 4000);
      return full?.result?.data?.username || uid.slice(0, 8);
    }

    async function worker() {
      while (idx < newOnes.length) {
        const uid = newOnes[idx++];
        const name = await resolveOne(uid);
        userMap.set(uid, name);
        // Cache hanya username asli; kalau fallback (UID), jangan di-cache supaya
        // bisa dicoba lagi di request berikutnya.
        if (name !== uid.slice(0, 8)) {
          const unameKey = new URL(base);
          unameKey.pathname = `/__tracker_user/${uid}`;
          cachePutJSON(cache, unameKey, { username: name }, USERNAME_TTL_SECONDS, waitUntil);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, newOnes.length) }, worker));

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

    const payload = {
      success: true,
      data: {
        countryId,
        fetchedAt: new Date().toISOString(),
        total: transactions.length,
        pagesFetched,
        usernamesResolved: userMap.size,
        usernamesPending: toResolve.length - newOnes.length,
        transactions,
      },
    };

    // L1: simpan agregat supaya request berikutnya cepat.
    cachePutJSON(cache, aggKey, payload, 300, waitUntil);

    return Response.json(payload, {
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  } catch (err: any) {
    console.error('[CF Tracker Transactions Error]', err);
    return Response.json(
      { success: false, error: 'Gagal mengambil data transaksi negara' },
      { status: 502, headers },
    );
  }
};
