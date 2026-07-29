// functions/api/warera/[[path]].ts
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
    const targetUrl = `https://api2.warera.io${subPath}${url.search}`;

    console.log(`[CF Proxy] ${request.method} ${url.pathname} -> ${targetUrl}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const authHeader = request.headers.get('authorization');
    const apiKeyHeader = request.headers.get('x-api-key');
    if (authHeader) headers['authorization'] = authHeader;
    if (apiKeyHeader) headers['x-api-key'] = apiKeyHeader;

    const fetchOptions: RequestInit = { method: request.method, headers };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const bodyText = await request.text();
      if (bodyText) fetchOptions.body = bodyText;
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    const responseHeaders = new Headers(getCorsHeaders(request));
    const safeHeaders = ['content-type', 'cache-control', 'expires', 'pragma'];
    safeHeaders.forEach((h) => {
      const val = response.headers.get(h);
      if (val) responseHeaders.set(h, val);
    });

    if (contentType.includes('application/json')) {
      const json = await response.json();
      return Response.json(json, { status: response.status, headers: responseHeaders });
    }
    const text = await response.text();
    return new Response(text, { status: response.status, headers: responseHeaders });

  } catch (err: any) {
    console.error('[CF Proxy Error] WarEra API:', err);
    return Response.json(
      { error: 'WarEra API Connection Failed', timestamp: new Date().toISOString() },
      { status: 502, headers: getCorsHeaders(request) }
    );
  }
};