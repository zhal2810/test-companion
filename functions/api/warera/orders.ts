// functions/api/warera/orders.ts
//
// Production Cloudflare Pages Function:
// GET /api/warera/orders?itemCode=iron&limit=30
//
// Fetches BID/OFFER orders and resolves WarEra user IDs to usernames.
// Sumber data: API komunitas warera.realmarijn.nl (satu-satunya). api2/gateway
// sudah TIDAK dipakai lagi.
import { callCommunity } from '../_shared/community';

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

  const json = await callCommunity('user.getUserLite', { userId }, 4000);
  const user = json?.result?.data;

  if (user?.username) {
    const info = {
      username: String(user.username),
      avatarUrl: user.avatarUrl ? String(user.avatarUrl) : '',
    };

    userCache.set(userId, info);
    return info;
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

    const data: any = await callCommunity('tradingOrder.getTopOrders', { itemCode, limit }, 5000);

    if (!data?.result?.data) {
      return Response.json(
        {
          error: 'Failed to fetch WarEra order book',
          itemCode,
          details: 'community API unavailable',
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