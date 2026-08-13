// functions/api/warera/orders.ts
// Dedicated Cloudflare Pages Function for WarEra BID / OFFER orders.

const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Cache-Control': 'no-store',
  };
}

function trpcInput(itemCode: string, limit: number) {
  return encodeURIComponent(JSON.stringify({ itemCode, limit }));
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'WarEra-Intelligence-Dashboard/1.0',
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, { status: 204, headers: cors(request) });

export const onRequestGet: PagesFunction = async ({ request }) => {
  const headers = cors(request);

  try {
    const url = new URL(request.url);

    const itemCode = (url.searchParams.get('itemCode') || 'iron').trim();
    const requestedLimit = Number(url.searchParams.get('limit') || '30');
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 30, 1), 100);

    if (!itemCode) {
      return Response.json(
        { error: 'itemCode is required' },
        { status: 400, headers }
      );
    }

    const input = trpcInput(itemCode, limit);

    // 1. Primary WarEraStats gateway
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
        data = await fetchJson(target.url, target.headers);
        if (data?.result?.data) break;
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
        { status: 502, headers }
      );
    }

    const buyOrders = Array.isArray(data.result.data.buyOrders)
      ? data.result.data.buyOrders
      : [];

    const sellOrders = Array.isArray(data.result.data.sellOrders)
      ? data.result.data.sellOrders
      : [];

    // Return the WarEra order shape unchanged.
    // The frontend is responsible for displaying only 10 BID + 10 OFFER.
    return Response.json(
      {
        result: {
          data: {
            buyOrders,
            sellOrders,
          },
        },
      },
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error('[CF Orders Error]', err);

    return Response.json(
      {
        error: 'Failed to fetch market orders',
        details: err?.message || 'Unknown error',
      },
      { status: 500, headers }
    );
  }
};
