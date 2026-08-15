// functions/api/players/[procedure].ts
// Cloudflare Pages Function: proxy ke API WarEra (tRPC).
// Untuk prosedur `user.*`, gateway.warerastats.io dicoba DULU (GET + ?input=)
// karena bentuknya terverifikasi (result.data.username) dan api2 sering menolak
// atau berbeda bentuk. Untuk prosedur lain, api2.warera.io utama (POST).
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

function encodeInput(input: unknown): string {
  return encodeURIComponent(JSON.stringify(input));
}

async function fetchFromGateway(procedure: string, input: Record<string, any>): Promise<any | null> {
  const url = `https://gateway.warerastats.io/trpc/${procedure}?input=${encodeInput(input)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-API-Key': 'warerastats' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (response.ok) return await response.json();
  } catch {
    // jatuh ke fallback
  }
  return null;
}

async function fetchFromApi2(
  procedure: string,
  input: Record<string, any>,
  apiKey: string | null,
): Promise<{ json: any; status: number } | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`https://api2.warera.io/trpc/${procedure}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await response.json();
    return { json, status: response.status };
  } catch {
    return null;
  }
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
    if (procedure.startsWith('user.')) {
      // user.* — gateway dulu (terverifikasi), api2 fallback.
      const gatewayJson = await fetchFromGateway(procedure, input);
      if (gatewayJson) {
        return Response.json(gatewayJson, { status: 200, headers: getCorsHeaders(request) });
      }
      const api2 = await fetchFromApi2(procedure, input, apiKey);
      if (api2) {
        return Response.json(api2.json, { status: api2.status, headers: getCorsHeaders(request) });
      }
      return Response.json(
        { error: 'Failed to call WarEra API (gateway & api2)' },
        { status: 502, headers: getCorsHeaders(request) },
      );
    }

    // Prosedur lain — api2 utama, gateway fallback.
    const api2 = await fetchFromApi2(procedure, input, apiKey);
    if (api2) {
      return Response.json(api2.json, { status: api2.status, headers: getCorsHeaders(request) });
    }
    const gatewayJson = await fetchFromGateway(procedure, input);
    if (gatewayJson) {
      return Response.json(gatewayJson, { status: 200, headers: getCorsHeaders(request) });
    }
    return Response.json(
      { error: 'Failed to call WarEra API (api2 & gateway)' },
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
