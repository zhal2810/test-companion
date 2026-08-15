// functions/api/warera/[[path]].ts
// Proxy catch-all /api/warera/** — diteruskan ke API komunitas warera.realmarijn.nl
// (satu-satunya sumber; api2/gateway sudah TIDAK dipakai lagi).
// Sub-path seperti /trpc/foo.bar diubah menjadi prosedur foo.bar.
import { callCommunity } from '../_shared/community';

const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  };
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  try {
    const subPath = url.pathname.replace(/^\/api\/warera/, '');
    const procedure = subPath
      .replace(/^\/trpc\//, '')
      .replace(/^\//, '')
      .replace(/\//g, '.');

    if (!procedure) {
      return Response.json({ error: 'Procedure is required' }, { status: 400, headers: getCorsHeaders(request) });
    }

    let input: Record<string, any> = {};
    const encoded = url.searchParams.get('input');
    if (encoded) {
      try {
        input = JSON.parse(encoded) ?? {};
      } catch {
        input = {};
      }
    } else {
      input = Object.fromEntries(url.searchParams.entries());
      for (const key in input) {
        if (typeof input[key] === 'string' && input[key].trim() !== '') {
          const num = Number(input[key]);
          if (!Number.isNaN(num)) input[key] = num;
        }
      }
    }

    console.log(`[CF Proxy warera] ${request.method} ${url.pathname} -> community ${procedure}`);

    const json = await callCommunity(procedure, input);
    if (json) {
      return Response.json(json, { status: 200, headers: getCorsHeaders(request) });
    }
    return Response.json(
      { error: `Failed to call WarEra API via community (${procedure})` },
      { status: 502, headers: getCorsHeaders(request) }
    );

  } catch (err: any) {
    console.error('[CF Proxy Error] WarEra API:', err);
    return Response.json(
      { error: 'WarEra API Connection Failed', timestamp: new Date().toISOString() },
      { status: 502, headers: getCorsHeaders(request) }
    );
  }
};
