// functions/api/warera/orders.ts
//
// Production Cloudflare Pages Function:
// GET /api/warera/orders?itemCode=iron&limit=30
//
// Fetches BID/OFFER orders and resolves WarEra user IDs to usernames.

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

async function fetchJson(
  url: string,
  extraHeaders: Record<string, string> = {},
) {
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

// Small in-memory cache. It prevents calling the user endpoint repeatedly
// for the same player during a warm Cloudflare isolate.
type UserInfo = {
  username: string;
  avatarUrl: string;
};

const userCache = new Map<string, UserInfo>();

async function resolveUsername(userId: string): Promise<UserInfo> {
  if (!userId) {
    return { username: 'Unknown', avatarUrl: '' };
  }

  const cached = userCache.get(userId);
  if (cached) return cached;

  const input = encodeURIComponent(JSON.stringify({ userId }));

  const targets = [
    {
      url: `https://gateway.warerastats.io/trpc/user.getUserLite?input=${input}`,
      headers: { 'X-API-Key': 'warerastats' },
    },
    {
      url: `https://api2.warera.io/trpc/user.getUserLite?input=${input}`,
      headers: {},
    },
    {
      url: `https://www.warera-pulse.info/api/wr/user.getUserLite?input=${input}`,
      headers: {},
    },
  ];

  for (const target of targets) {
    try {
      const json = await fetchJson(target.url, target.headers);
      const user = json?.result?.data;

      if (user?.username) {
        const info = {
          username: String(user.username),
          avatarUrl: user.avatarUrl ? String(user.avatarUrl) : '',
        };

        userCache.set(userId, info);
        return info;
      }
    } catch {
      // Try next provider.
    }
  }

  // Important: keep the order even if the username endpoint fails.
  const fallback = {
    username: userId,
    avatarUrl: '',
  };

  userCache.set(userId, fallback);
  return fallback;
}

async function enrichOrders(orders: any[]): Promise<any[]> {
  if (!Array.isArray(orders) || orders.length === 0) return [];

  const uniqueIds = Array.from(
    new Set(
      orders
        .map((order) => order?.user)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );

  // Resolve in parallel so 20 orders do not wait one-by-one.
  await Promise.all(uniqueIds.map((id) => resolveUsername(id)));

  return orders.map((order) => {
    const userId = typeof order?.user === 'string' ? order.user : '';
    const user = userCache.get(userId);

    return {
      ...order,

      // Keep original `user` field for compatibility.
      user: userId,

      // Frontend can use these directly.
      username: user?.username || userId || 'Unknown',
      avatarUrl: user?.avatarUrl || '',
    };
  });
}

export const onRequestOptions: PagesFunction = async ({ request }) => {
  return new Response(null, {
    status: 204,
    headers: cors(request),
  });
};

export const onRequestGet: PagesFunction = async ({ request }) => {
  const headers = cors(request);

  try {
    const url = new URL(request.url);
    const itemCode = (url.searchParams.get('itemCode') || '').trim();

    const requestedLimit = Number(url.searchParams.get('limit') || '30');
    const limit = Math.max(
      1,
      Math.min(
        Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 30,
        100,
      ),
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

        errors.push(
          `${new URL(target.url).hostname}: invalid JSON shape`,
        );
      } catch (err: any) {
        errors.push(
          `${new URL(target.url).hostname}: ${err?.message || 'failed'}`,
        );
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

    const rawBuyOrders = Array.isArray(data.result.data.buyOrders)
      ? data.result.data.buyOrders
      : [];

    const rawSellOrders = Array.isArray(data.result.data.sellOrders)
      ? data.result.data.sellOrders
      : [];

    const [buyOrders, sellOrders] = await Promise.all([
      enrichOrders(rawBuyOrders),
      enrichOrders(rawSellOrders),
    ]);

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