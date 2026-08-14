// functions/api/market/offers/[itemCode].ts
//
// Production Cloudflare Pages Function:
// GET /api/market/offers/:itemCode?limit=20
//
// Mirrors the Express route (server.ts) so the Live Market Offers feed works
// on the deployed site. itemOffer.getAll/getById are not exposed on the public
// API hosts, so this uses tradingOrder.getTopOrders + username enrichment.

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

  const text = await response.text();
  if (!text || text.trim().startsWith('<')) {
    throw new Error(`${new URL(url).hostname} returned HTML instead of JSON`);
  }

  return JSON.parse(text);
}

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

  const targets: Array<{ url: string; headers: Record<string, string> }> = [
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

  const fallback = {
    username: `${userId.slice(0, 8)}...`,
    avatarUrl: '',
  };

  userCache.set(userId, fallback);
  return fallback;
}

async function enrichOffers(offers: any[]): Promise<any[]> {
  if (!Array.isArray(offers) || offers.length === 0) return [];

  const uniqueIds = Array.from(
    new Set(
      offers
        .map((offer) => offer?.user)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );

  await Promise.all(uniqueIds.map((id) => resolveUsername(id)));

  return offers.map((offer) => {
    const userId = typeof offer?.user === 'string' ? offer.user : '';
    const user = userCache.get(userId);

    return {
      ...offer,
      user: userId,
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

export const onRequestGet: PagesFunction = async ({ request, params }) => {
  const headers = cors(request);

  try {
    const itemCode = String(params.itemCode || '').trim();

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') || '20');
    const limit = Math.max(
      1,
      Math.min(
        Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 20,
        100,
      ),
    );

    if (!itemCode) {
      return Response.json(
        { success: false, error: 'itemCode is required' },
        { status: 400, headers },
      );
    }

    const input = encodeURIComponent(JSON.stringify({ itemCode, limit }));

    const targets: Array<{ url: string; headers: Record<string, string> }> = [
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
    let dataSource = 'none';

    for (const target of targets) {
      try {
        const candidate = await fetchJson(target.url, target.headers);

        if (candidate?.result?.data) {
          data = candidate;
          dataSource = new URL(target.url).hostname;
          break;
        }
      } catch {
        // Try next provider.
      }
    }

    if (!data?.result?.data) {
      return Response.json(
        {
          success: true,
          data: [],
          count: 0,
          warning: 'No offers found or API unavailable',
          source: dataSource,
        },
        { status: 200, headers },
      );
    }

    const buyOrders = Array.isArray(data.result.data.buyOrders)
      ? data.result.data.buyOrders
      : [];

    const sellOrders = Array.isArray(data.result.data.sellOrders)
      ? data.result.data.sellOrders
      : [];

    const rawOffers = [...buyOrders, ...sellOrders];
    const enrichedOffers = await enrichOffers(rawOffers);

    return Response.json(
      {
        success: true,
        data: enrichedOffers.slice(0, limit),
        count: Math.min(enrichedOffers.length, limit),
        source: dataSource,
      },
      { status: 200, headers },
    );
  } catch (err: any) {
    console.error('[CF Offers Error]', err);

    return Response.json(
      {
        success: false,
        error: 'Failed to fetch offers',
        details: err?.message || 'Unknown error',
      },
      { status: 502, headers },
    );
  }
};
