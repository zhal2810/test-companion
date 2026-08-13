// functions/api/players/[procedure].ts
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

  const apiKey = request.headers.get('x-api-key');

  try {
    const targetUrl = `https://api2.warera.io/trpc/${procedure}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    // ⚠️ Jika docs bilang GET, ganti method ini jadi 'GET'
    // Tapi untuk tRPC biasanya POST untuk procedure dengan input body
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    const json = await response.json();
    return Response.json(json, { status: response.status, headers: getCorsHeaders(request) });

  } catch (err: any) {
    console.error(`[CF Proxy Error] ${procedure}:`, err);
    return Response.json(
      { error: 'Failed to call WarEra API' },
      { status: 502, headers: getCorsHeaders(request) }
    );
  }
};