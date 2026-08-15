// functions/api/warera/order.ts
// Cloudflare Pages Function: WarEra BID / OFFER + username/avatar enrichment.
// Sumber data: API komunitas warera.realmarijn.nl (satu-satunya). api2/gateway
// sudah TIDAK dipakai lagi.
import { callCommunity } from '../_shared/community';

const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

type UserLite = {
  username: string;
  avatarUrl: string;
  country?: string;
  mu?: string;
};

const userCache = new Map<string, UserLite>();

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-API-Key',
    'Cache-Control': 'no-store',
  };
}

async function fetchWareraTRPC(
  procedure: string,
  input: unknown,
  timeoutMs = 5000,
): Promise<any | null> {
  return callCommunity(procedure, input, timeoutMs);
}

async function resolveUserLite(userId: string): Promise<UserLite> {
  if (!userId) {
    return { username: 'Unknown', avatarUrl: '' };
  }

  const cached = userCache.get(userId);
  if (cached) return cached;

  const json = await fetchWareraTRPC(
    'user.getUserLite',
    { userId },
    4000,
  );

  const user = json?.result?.data;

  if (user?.username) {
    const info: UserLite = {
      username: user.username,
      avatarUrl: user.avatarUrl || '',
      country: user.country,
      mu: user.mu,
    };

    userCache.set(userId, info);
    return info;
  }

  // Keep the ID as a fallback if the username endpoint is unavailable.
  const fallback: UserLite = {
    username: userId.slice(0, 8),
    avatarUrl: '',
  };

  userCache.set(userId, fallback);
  return fallback;
}

async function enrichOrders(orders: any[]) {
  const userIds = Array.from(
    new Set(
      orders
        .map((order) => order?.user)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );

  // Resolve in parallel. The cache prevents repeated lookups every refresh.
  await Promise.all(
    userIds.map(async (userId) => {
      await resolveUserLite(userId);
    }),
  );

  return orders.map((order) => {
    const userId = order?.user;
    const info = userId ? userCache.get(userId) : undefined;

    return {
      ...order,
      username: info?.username || (userId ? userId.slice(0, 8) : 'Unknown'),
      avatarUrl: info?.avatarUrl || '',
      country: info?.country,
      mu: info?.mu,
    };
  });
}

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, {
    status: 204,
    headers: cors(request),
  });

export const onRequestGet: PagesFunction = async ({ request }) => {
  const headers = cors(request);

  try {
    const url = new URL(request.url);

    const itemCode = (url.searchParams.get('itemCode') || 'iron').trim();
    const requestedLimit = Number(url.searchParams.get('limit') || '30');

    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit) ? requestedLimit : 30,
        1,
      ),
      100,
    );

    if (!itemCode) {
      return Response.json(
        { error: 'itemCode is required' },
        { status: 400, headers },
      );
    }

    // Primary order-book sources.
    let data = await fetchWareraTRPC(
      'tradingOrder.getTopOrders',
      { itemCode, limit },
      5000,
    );

    if (!data?.result?.data) {
      return Response.json(
        {
          error: 'Failed to fetch WarEra order book',
          itemCode,
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
      {
        status: 200,
        headers,
      },
    );
  } catch (error: any) {
    console.error('[CF Orders Error]', error);

    return Response.json(
      {
        error: 'Failed to fetch market orders',
        details: error?.message || 'Unknown error',
      },
      {
        status: 500,
        headers,
      },
    );
  }
};