// functions/api/market/offers/[itemCode].ts
//
// Production Cloudflare Pages Function:
// GET /api/market/offers/:itemCode?limit=20
//
// Returns REALIZED trading transactions (not pending orders) for an item,
// enriched with the buyer's username + avatar. Uses
// transaction.getPaginatedTransactions (filtered by itemCode + 'trading').
// Sumber data: API komunitas warera.realmarijn.nl (satu-satunya).
import { callCommunity } from '../../_shared/community';

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

  const fallback = {
    username: `${userId.slice(0, 8)}...`,
    avatarUrl: '',
  };

  userCache.set(userId, fallback);
  return fallback;
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

    const data: any = await callCommunity(
      'transaction.getPaginatedTransactions',
      { itemCode, limit, transactionType: 'trading' },
      6000,
    );

    const dataSource = 'warera.realmarijn.nl';

    const rawTransactions = Array.isArray(data?.result?.data?.items)
      ? data.result.data.items
      : [];

    if (rawTransactions.length === 0) {
      return Response.json(
        {
          success: true,
          data: [],
          count: 0,
          warning: 'No trades found or API unavailable',
          source: dataSource,
        },
        { status: 200, headers },
      );
    }

    const userIds: string[] = Array.from(
      new Set<string>(
        rawTransactions
          .flatMap((tx: any) => [tx?.buyerId, tx?.sellerId])
          .filter(Boolean),
      ),
    );

    await Promise.all(userIds.map((id) => resolveUsername(id)));

    const trades = rawTransactions.map((tx: any) => {
      const buyerId = typeof tx?.buyerId === 'string' ? tx.buyerId : '';
      const sellerId = typeof tx?.sellerId === 'string' ? tx.sellerId : '';
      const buyer = buyerId ? userCache.get(buyerId) : undefined;
      const seller = sellerId ? userCache.get(sellerId) : undefined;
      const money = Number(tx?.money) || 0;
      const quantity = Number(tx?.quantity) || 0;

      return {
        _id: tx?._id || tx?.id,
        id: tx?._id || tx?.id,
        itemCode: tx?.itemCode || itemCode,
        quantity,
        money,
        price: quantity > 0 ? money / quantity : 0,
        createdAt: tx?.createdAt,
        transactionType: tx?.transactionType || 'trading',
        type: 'buy',
        buyerId,
        sellerId,
        username: buyer?.username || 'Unknown',
        avatarUrl: buyer?.avatarUrl || '',
        usernameSeller: seller?.username || '',
        avatarUrlSeller: seller?.avatarUrl || '',
      };
    });

    return Response.json(
      {
        success: true,
        data: trades.slice(0, limit),
        count: Math.min(trades.length, limit),
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
