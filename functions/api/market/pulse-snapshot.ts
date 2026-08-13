// functions/api/market/pulse-snapshot.ts
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  try {
    const response = await fetch('https://www.warera-pulse.info/api/snapshot', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)' },
    });

    if (!response.ok) {
      return Response.json(
        { success: false, error: 'Failed to fetch snapshot' },
        { status: response.status, headers: getCorsHeaders(request) }
      );
    }

    const data = await response.json();
    return Response.json(
      { success: true, data },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
          ...getCorsHeaders(request),
        },
      }
    );

  } catch (err: any) {
    console.error('[CF Pulse Snapshot Error]', err);
    return Response.json(
      { success: false, error: 'WarEra Pulse unavailable' },
      { status: 502, headers: getCorsHeaders(request) }
    );
  }
};