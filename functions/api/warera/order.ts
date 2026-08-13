// functions/api/warera/orders.ts
//
// Dedicated Cloudflare Pages Function for the WarEra trading order book.
// This must be a dedicated route because /api/warera/* normally proxies
// directly to api2.warera.io, while tradingOrder.getTopOrders is a tRPC
// procedure.

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
  };
}

function trpcUrl(base: string, procedure: string, input: unknown) {
  const encoded = encodeURIComponent(JSON.stringify(input));
  return `${base}/trpc/${procedure}?input=${encoded}`;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 5000,
): Promise<any | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return null;

    const text = await response.text();
    if (!text || text.trim().startsWith('<')) return null;

    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchOrders(itemCode: string, limit: number) {
  const input = { itemCode, limit };

  // 1. WarEraStats gateway: fastest/cached source.
  const gateway = await fetchJson(
    trpcUrl(
      'https://gateway.warerastats.io',
      'tradingOrder.getTopOrders',
      input,
    ),
    {
      'X-API-Key': 'warerastats',
      'User-Agent': 'WarEra-Companion/1.0',
      Accept: 'application/json',
    },
  );

  if (gateway) return gateway;

  // 2. Official-ish secondary API endpoint.
  const api2 = await fetchJson(
    trpcUrl('https://api2.warera.io', 'tradingOrder.getTopOrders', input),
    {
      'User-Agent': 'WarEra-Companion/1.0',
      Accept: 'application/json',
    },
  );

  if (api2) return api2;

  // 3. WarEra Pulse fallback used by the existing market integration.
  const encoded = encodeURIComponent(JSON.stringify(input));
  return fetchJson(
    `https://www.warera-pulse.info/api/wr/tradingOrder.getTopOrders?input=${encoded}`,
    {
      'User-Agent': 'WarEra-Companion/1.0',
      Accept: 'application/json',
    },
  );
}

async function resolveUserLite(userId: string) {
  if (!userId) return null;

  const input = encodeURIComponent(JSON.stringify({ userId }));

  const gateway = await fetchJson(
    `https://gateway.warerastats.io/trpc/user.getUserLite?input=${input}`,
    {
      'X-API-Key': 'warerastats',
      'User-Agent': 'WarEra-Companion/1.0',
      Accept: 'application/json',
    },
    3500,
  );

  const data = gateway?.result?.data;
  if (data?.username) return data;

  const api2 = await fetchJson(
    `https://api2.warera.io/trpc/user.getUserLite?input=${input}`,
    {
      'User-Agent': 'WarEra-Companion/1.0',
      Accept: 'application/json',
    },
    3500,
  );

  return api2?.result?.data || null;
}

function normalizeOrder(order: any, type: 'buy' | 'sell', itemCode: string) {
  const quantity = Number(
    order?.quantity ??
    order?.amount ??
    order?.units ??
    order?.volume ??
    0,
  );

  const price = Number(
    order?.price ??
    order?.unitPrice ??
    order?.pricePerUnit ??
    0,
  );

  return {
    ...order,
    _id: order?._id || order?.id,
    user: order?.user || order?.userId,
    itemCode: order?.itemCode || itemCode,
    quantity,
    price,
    offerAt:
      order?.offerAt ||
      order?.createdAt ||
      order?.updatedAt ||
      order?.created_at ||
      '',
    type,
  };
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: cors(request),
    });
  }

  if (request.method !== 'GET') {
    return Response.json(
      { error: 'Method Not Allowed' },
      { status: 405, headers: cors(request) },
    );
  }

  try {
    const url = new URL(request.url);
    const itemCode = (url.searchParams.get('itemCode') || '').trim().toLowerCase();

    if (!itemCode) {
      return Response.json(
        { error: 'itemCode is required' },
        { status: 400, headers: cors(request) },
      );
    }

    // Upstream can receive up to 30. The UI itself only renders 10 per side.
    const requestedLimit = Number(url.searchParams.get('limit') || '30');
    const limit = Math.max(
      1,
      Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 30, 100),
    );

    const data = await fetchOrders(itemCode, limit);

    if (!data) {
      return Response.json(
        {
          error: 'Failed to fetch WarEra trading orders',
          itemCode,
        },
        { status: 502, headers: cors(request) },
      );
    }

    const rawBuy = Array.isArray(data?.result?.data?.buyOrders)
      ? data.result.data.buyOrders
      : [];
    const rawSell = Array.isArray(data?.result?.data?.sellOrders)
      ? data.result.data.sellOrders
      : [];

    const allUsers = Array.from(
      new Set(
        [...rawBuy, ...rawSell]
          .map((order: any) => order?.user || order?.userId)
          .filter(Boolean),
      ),
    ) as string[];

    // Resolve usernames in parallel. A failed lookup does not break the order book.
    const users = await Promise.all(
      allUsers.map(async (userId) => [userId, await resolveUserLite(userId)] as const),
    );

    const userMap = new Map<string, any>(users);

    const enrich = (order: any, type: 'buy' | 'sell') => {
      const normalized = normalizeOrder(order, type, itemCode);
      const user = normalized.user ? userMap.get(normalized.user) : null;

      return {
        ...normalized,
        username:
          user?.username ||
          normalized.username ||
          (normalized.user
            ? `${String(normalized.user).slice(0, 8)}...`
            : 'Unknown'),
        avatarUrl: user?.avatarUrl || normalized.avatarUrl || '',
      };
    };

    return Response.json(
      {
        result: {
          data: {
            buyOrders: rawBuy.map((order: any) => enrich(order, 'buy')),
            sellOrders: rawSell.map((order: any) => enrich(order, 'sell')),
          },
        },
      },
      {
        status: 200,
        headers: {
          ...cors(request),
          'Cache-Control': 'public, max-age=10, s-maxage=10',
        },
      },
    );
  } catch (error: any) {
    console.error('[CF Orders] Error:', error);

    return Response.json(
      {
        error: 'Failed to fetch market order book',
        details: error?.message || 'Unknown error',
      },
      {
        status: 500,
        headers: cors(request),
      },
    );
  }
};
