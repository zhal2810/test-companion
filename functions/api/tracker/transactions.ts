// functions/api/tracker/transactions.ts
// Cloudflare Pages Function: riwayat transaksi per negara (pagination + resolve username).
const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

const DEFAULT_COUNTRY_ID = '6813b6d546e731854c7ac829'; // Indonesia
const MAX_PAGES = 500; // amankan dari infinite loop (~50.000 transaksi)
const RAW_TTL_SECONDS = 900; // cache raw transactions 15 menit (hindari pagination ulang)
const USER_CACHE_TTL_SECONDS = 60 * 60 * 24; // cache username 24 jam

// Cloudflare Pages Functions membatasi jumlah subrequest per invocation
// (50 di plan Free, 1000 di plan Paid). Dengan ratusan/ribuan user unik per
// negara, resolve username untuk SEMUANYA dalam satu request akan melebihi
// limit itu dan sisanya gagal -> fallback ke UID mentah.
//
// Strategi (Free-plan friendly):
//   1. Raw transactions di-cache (L2) 15 menit → pagination tidak diulang,
//      sehingga kuota subrequest hampir seluruhnya tersedia untuk resolve.
//   2. Resolve username BARU dibatasi per request secara ADAPTIF:
//        budget = min(MAX_NEW_RESOLUTIONS, subrequestLimit - pagesThisRun)
//      Dengan cache raw hangat (pagesThisRun = 0) dan subrequestLimit default
//      50 (Free), budget ≈ 25-40 user per siklus; sisanya ter-resolve di
//      request berikutnya. Fallback UID tidak di-cache → selalu dicoba ulang.
//   Env SUBREQUEST_LIMIT bisa di-override (mis. "1000" di plan Paid).
const MAX_NEW_RESOLUTIONS = 40;
const CONCURRENCY = 6;

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

// Key cache khusus untuk hasil resolve username per-uid, terpisah dari cache
// agregat/raw (yang cuma bertahan 5-15 menit). TTL di sini jauh lebih panjang
// karena username jarang berubah, sehingga sekali ter-resolve, uid tsb tidak
// perlu subrequest lagi di request-request berikutnya.
function userCacheUrl(uid: string): URL {
  const safe = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  return new URL(`https://cache.internal/__tracker_user_cache/${safe}`);
}

async function getCachedUsername(cache: Cache, uid: string): Promise<string | null> {
  try {
    const res = await cache.match(userCacheUrl(uid));
    if (!res) return null;
    const data = (await res.json()) as { username?: string };
    return data?.username || null;
  } catch {
    return null;
  }
}

async function setCachedUsername(cache: Cache, uid: string, username: string): Promise<void> {
  try {
    const res = new Response(JSON.stringify({ username }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${USER_CACHE_TTL_SECONDS}`,
      },
    });
    await cache.put(userCacheUrl(uid), res);
  } catch {
    // Cache tidak tersedia (mis. dev server) - abaikan, tidak fatal.
  }
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
  waitUntil?: any,
): void {
  const res = new Response(JSON.stringify(value), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAgeSeconds}`,
    },
  });
  try {
    const p = cache.put(key, res);
    if (waitUntil) waitUntil(p);
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

    // L2: raw transactions (15 menit) — hindari pagination ulang tiap request.
    // Ini kunci di plan Free: kalau pagination (≈49 halaman) diulang tiap
    // request, kuota 50 subrequest habis sebelum resolve username dimulai.
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

    // 1) Cek cache per-uid dulu — ini TIDAK memakai subrequest sama sekali,
    //    jadi user yang sudah pernah ter-resolve akan langsung dapat username
    //    tanpa menyentuh limit subrequest.
    const uncachedIds: string[] = [];
    for (const uid of userIds) {
      const cached = await getCachedUsername(cache, uid);
      if (cached) {
        userMap.set(uid, cached);
      } else {
        uncachedIds.push(uid);
      }
    }

    // 2) Resolve username BARU secara batch (concurrency 6), dibatasi jumlahnya
    //    per request secara ADAPTIF. Sejak resolveUsername cuma pakai 1
    //    subrequest per user (bukan sampai 4 seperti versi lama yang mencoba
    //    gateway.warerastats.io dulu), budget bisa dihitung 1:1 terhadap sisa
    //    kuota subrequest, bukan dibagi 2 lagi.
    const resolveBudget = Math.min(
      MAX_NEW_RESOLUTIONS,
      Math.max(0, subrequestLimit - pagesFetchedThisRun - 2), // -2 sebagai bantalan
    );
    const idsToResolve = uncachedIds.slice(0, resolveBudget);

    async function resolveUsername(uid: string): Promise<string> {
      try {
        // Sesuai dokumentasi resmi (api2.warera.io/docs): SEMUA endpoint
        // WarEra API adalah GET, bukan POST. Kirim input via query string
        // ?input= (format standar tRPC GET), langsung ke api2.warera.io —
        // jalur gateway.warerastats.io yang dipakai versi sebelumnya
        // kemungkinan besar penyebab utama resolve gagal massal.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const input = encodeURIComponent(JSON.stringify({ userId: uid }));
        const res = await fetch(`https://api2.warera.io/trpc/user.getUserById?input=${input}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(apiKey ? { 'X-API-Key': apiKey } : {}),
          },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const json: any = await res.json();
          const name = json?.result?.data?.username;
          if (name) return name;
        }
      } catch {
        // jatuh ke fallback di bawah
      }
      return uid.slice(0, 8);
    }

    let idx = 0;
    async function worker() {
      while (idx < idsToResolve.length) {
        const uid = idsToResolve[idx++];
        const name = await resolveUsername(uid);
        userMap.set(uid, name);
        // Simpan ke cache hanya jika benar-benar berhasil resolve (bukan
        // fallback UID), supaya lain kali tetap dicoba ulang, bukan
        // "terkunci" ke UID selamanya.
        if (name !== uid.slice(0, 8)) {
          const p = setCachedUsername(cache, uid, name);
          if (waitUntil) waitUntil(p);
          else await p;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, idsToResolve.length) }, worker));

    // User yang belum sempat diresolve di request ini (melebihi batas) tetap
    // dapat fallback UID pendek untuk sekarang.
    for (const uid of uncachedIds) {
      if (!userMap.has(uid)) userMap.set(uid, uid.slice(0, 8));
    }

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
        usernamesPending: uncachedIds.length - idsToResolve.length,
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