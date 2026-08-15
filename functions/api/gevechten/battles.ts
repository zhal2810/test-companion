// functions/api/gevechten/battles.ts
// Cloudflare Pages Function: proxy ke endpoint agregasi "Live Gevechten" komunitas
// warera.realmarijn.nl/api/gevechten/battles. Endpoint ini sudah menghitung semua
// bonus (MU-order, MU-HQ, bunker/mil-basis, pact, aliansi), order-kosten, dan
// land-orders per sisi — jadi kita tidak perlu hitung ulang.
const COMMUNITY_GVECHTEN_URL = 'https://warera.realmarijn.nl/api/gevechten/battles';

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  };
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  try {
    const upstream = await fetch(COMMUNITY_GVECHTEN_URL);
    if (!upstream.ok) {
      return Response.json(
        { error: `Komunitas gevechten gagal (${upstream.status})` },
        { status: 502, headers: getCorsHeaders(request) },
      );
    }
    const json = await upstream.json();
    return Response.json(json, { status: 200, headers: getCorsHeaders(request) });
  } catch (err: any) {
    console.error('[CF gevechten] Gagal ambil data dari komunitas:', err);
    return Response.json(
      { error: 'Gagal ambil data gevechten' },
      { status: 502, headers: getCorsHeaders(request) },
    );
  }
};
