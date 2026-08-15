// functions/api/tracker/username.ts
// Resolve SATU userId -> username, dipanggil on-demand dari frontend per baris
// yang sedang terlihat di layar. Ini sengaja dipisah dari transactions.ts
// supaya tidak pernah menabrak limit subrequest Cloudflare Pages Functions
// (50/request di plan Free) — karena setiap invocation cuma perlu resolve
// 1 user, bukan ribuan sekaligus.
//
// PENTING: resolve dilakukan lewat POST ke api2.warera.io/trpc/user.getUserById
// — jalur yang sama persis dengan proxy generik functions/api/players/[procedure].ts
// yang sudah terbukti berhasil (lihat /api/players/user.getUserById?userId=...).
// Versi sebelumnya mencoba gateway.warerastats.io (GET + X-API-Key hardcoded
// "warerastats") lebih dulu — endpoint itu kemungkinan besar yang selama ini
// gagal/di-rate-limit, menyebabkan HAMPIR SEMUA resolve jatuh ke fallback UID.
const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

const USER_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 jam

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };
}

async function fetchUserById(userId: string, apiKey: string | null, timeoutMs = 6000): Promise<any | null> {
  // Coba POST dulu — ini jalur yang TERBUKTI berhasil (sama dengan proxy
  // functions/api/players/[procedure].ts yang sudah dites langsung dan
  // mengembalikan data user lengkap). GET dipakai sebagai fallback saja,
  // karena dokumentasi resmi menyebut GET tapi pada praktiknya endpoint ini
  // merespons baik lewat POST juga.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const response = await fetch('https://api2.warera.io/trpc/user.getUserById', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (response.ok) {
      const json = await response.json();
      if ((json as any)?.result?.data) return json;
    }
  } catch {
    // lanjut ke fallback GET
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const input = encodeURIComponent(JSON.stringify({ userId }));
    const response = await fetch(`https://api2.warera.io/trpc/user.getUserById?input=${input}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (response.ok) return await response.json();
  } catch {
    // fallback ke uid pendek di caller
  }
  return null;
}

function userCacheUrl(uid: string): URL {
  const safe = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  return new URL(`https://cache.internal/__tracker_user_cache/${safe}`);
}

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, { status: 204, headers: getCorsHeaders(request) });

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const headers = getCorsHeaders(request);
  const url = new URL(request.url);
  const uid = (url.searchParams.get('id') || '').trim();
  const apiKey = request.headers.get('x-api-key');

  if (!uid) {
    return Response.json({ success: false, error: 'id wajib diisi' }, { status: 400, headers });
  }

  const cache = caches.default;
  const cacheKey = userCacheUrl(uid);

  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const data = (await cached.json()) as { username?: string };
      if (data?.username) {
        return Response.json(
          { success: true, data: { id: uid, username: data.username, cached: true } },
          { headers },
        );
      }
    }
  } catch {
    // lanjut resolve fresh
  }

  let username = uid.slice(0, 8);
  const json = await fetchUserById(uid, apiKey);
  const fetchedName = json?.result?.data?.username;
  if (fetchedName) username = fetchedName;

  const resolved = username !== uid.slice(0, 8);

  if (resolved) {
    try {
      const res = new Response(JSON.stringify({ username }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${USER_CACHE_TTL_SECONDS}`,
        },
      });
      const ctx = context as any;
      if (ctx?.waitUntil) {
        ctx.waitUntil(cache.put(cacheKey, res));
      } else {
        await cache.put(cacheKey, res);
      }
    } catch {
      // cache tidak tersedia, tidak fatal
    }
  }

  return Response.json(
    { success: true, data: { id: uid, username, cached: false, resolved } },
    { headers },
  );
};