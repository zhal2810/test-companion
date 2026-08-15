// functions/api/players/[procedure].ts
// Cloudflare Pages Function: proxy ke API WarEra (tRPC) via API komunitas
// warera.realmarijn.nl — satu-satunya sumber. api2.warera.io & gateway.warerastats.io
// sudah TIDAK dipakai lagi (dipangkas jadi satu).
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
  const { request, params } = context;
  const procedure = params.procedure as string;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  console.log(`[CF Proxy players] ${request.method} procedure: ${procedure}`);

  let rawInput: Record<string, any> = {};
  if (request.method === 'GET') {
    rawInput = Object.fromEntries(url.searchParams.entries());
  } else {
    try {
      const body = await request.json().catch(() => ({}));
      rawInput = (body as any)?.input ?? body ?? {};
    } catch { rawInput = {}; }
  }

  const input: Record<string, any> = { ...rawInput };
  for (const key in input) {
    if (typeof input[key] === 'string' && input[key].trim() !== '') {
      const num = Number(input[key]);
      if (!Number.isNaN(num)) input[key] = num;
    }
  }

  try {
    const json = await callCommunity(procedure, input);
    if (json) {
      return Response.json(json, { status: 200, headers: getCorsHeaders(request) });
    }
    return Response.json(
      { error: `Failed to call WarEra API via community (${procedure})` },
      { status: 502, headers: getCorsHeaders(request) },
    );
  } catch (err: any) {
    console.error(`[CF Proxy Error] ${procedure}:`, err);
    return Response.json(
      { error: 'Failed to call WarEra API' },
      { status: 502, headers: getCorsHeaders(request) }
    );
  }
};
