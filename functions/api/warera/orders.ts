// functions/api/warera/orders.ts
//
// Production Cloudflare Pages Function for:
//   GET /api/warera/orders?itemCode=iron&limit=30
//
// The frontend can request 30 orders, while OrderBook.tsx displays only
// the first 10 BID + first 10 OFFER.

const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

function cors(request: Request): Headers {
  const origin = request.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : 'https://test-companion.pages.dev';

  return new Headers({
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Cache-Control': 'public, max-age=5',
    'Content-Type': 'application/json; charset=utf-8',
  });
}

async function fetchJson(url: string, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'WarEra-Companion/1.0',
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
  }

  return response.json();
}

export const onRequestOptions: PagesFunction = async ({ request }) => {
  return new Response(null, { status: 204, headers: cors(request) });
};

export const onRequestGet: PagesFunction = async ({ request }) => {
  const headers = cors(request);

  try {
    const url = new URL(request.url);
    const itemCode = (url.searchParams.get('itemCode') || '').trim();

    const requestedLimit = Number(url.searchParams.get('limit') || '30');
    const limit = Math.max(
      1,
      Math.min(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 30, 100),
    );

    if (!itemCode) {
      return Response.json(
        { error: "Query parameter 'itemCode' is required" },
        { status: 400, headers },
      );
    }

    const input = encodeURIComponent(JSON.stringify({ itemCode, limit }));

    const targets = [
      {
        url: `https://gateway.warerastats.io/trpc/tradingOrder.getTopOrders?input=${input}`,
        headers: { 'X-API-Key': 'warerastats' },
      },
      {
        url: `https://api2.warera.io/trpc/tradingOrder.getTopOrders?input=${input}`,
        headers: {},
      },
      {
        url: `https://www.warera-pulse.info/api/wr/tradingOrder.getTopOrders?input=${input}`,
        headers: {},
      },
    ];

    let data: any = null;
    const errors: string[] = [];

    for (const target of targets) {
      try {
        const candidate = await fetchJson(target.url, target.headers);
        if (candidate?.result?.data) {
          data = candidate;
          break;
        }
        errors.push(`${new URL(target.url).hostname}: invalid JSON shape`);
      } catch (err: any) {
        errors.push(`${new URL(target.url).hostname}: ${err?.message || 'failed'}`);
      }
    }

    if (!data?.result?.data) {
      return Response.json(
        {
          error: 'Failed to fetch WarEra order book',
          itemCode,
          details: errors,
        },
        { status: 502, headers },
      );
    }

    const buyOrders = Array.isArray(data.result.data.buyOrders)
      ? data.result.data.buyOrders
      : [];

    const sellOrders = Array.isArray(data.result.data.sellOrders)
      ? data.result.data.sellOrders
      : [];

    // Return the original WarEra order objects. Username/avatar enrichment,
    // when available from upstream, is preserved.
    return Response.json(
      {
        result: {
          data: {
            buyOrders,
            sellOrders,
          },
        },
      },
      { status: 200, headers },
    );
  } catch (err: any) {
    console.error('[CF Orders Error]', err);

    return Response.json(
      {
        error: 'Failed to fetch market orders',
        details: err?.message || 'Unknown error',
      },
      { status: 500, headers },
    );
  }
};
