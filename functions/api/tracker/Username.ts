// functions/api/tracker/username.ts
// Resolve SATU userId -> username, dipanggil on-demand dari frontend per baris
// yang sedang terlihat di layar. Ini sengaja dipisah dari transactions.ts
// supaya tidak pernah menabrak limit subrequest Cloudflare Pages Functions
// (50/request di plan Free) — karena setiap invocation cuma perlu resolve
// 1 user, bukan ribuan sekaligus.
//
// Sumber data: API komunitas warera.realmarijn.nl (satu-satunya). api2/gateway
// sudah TIDAK dipakai lagi.
import { callCommunity } from '../_shared/community';

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

async function fetchUserById(userId: string, timeoutMs = 6000): Promise<any | null> {
  // API komunitas — satu subrequest, bentuk respons identik dengan api2 dulu.
  try {
    const json = await callCommunity('user.getUserById', { userId }, timeoutMs);
    if (json?.result?.data) return json;
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
  const json = await fetchUserById(uid);
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