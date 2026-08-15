// functions/api/stats/item/[item].ts
// Stats per item: orderbook (bid/ask levels) dibangun dari API komunitas
// warera.realmarijn.nl tradingOrder.getTopOrders. warerastats.io sudah TIDAK
// dipakai lagi (pihak ketiga yang tidak dipelihara).
import { callCommunity } from '../../_shared/community';

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

// Agregasi order per-tingkat harga menjadi level orderbook {price, quantity}.
function aggregateLevels(orders: any[]): { price: number; quantity: number }[] {
  const map = new Map<number, number>();
  for (const o of orders || []) {
    const price = Number(o?.price);
    const qty = Number(o?.quantity);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty)) continue;
    map.set(price, (map.get(price) || 0) + qty);
  }
  return Array.from(map.entries())
    .map(([price, quantity]) => ({ price, quantity }))
    .sort((a, b) => a.price - b.price);
}

export const onRequestGet: PagesFunction = async (context) => {
  const { request, params } = context;
  const item = params.item as string;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  try {
    const json = await callCommunity('tradingOrder.getTopOrders', { itemCode: item, limit: 100 }, 6000);
    const data = json?.result?.data;

    if (!data) {
      return Response.json(
        { success: false, error: `Community API returned no order book for ${item}` },
        { status: 502, headers: getCorsHeaders(request) }
      );
    }

    const payload = {
      success: true,
      data: {
        orderbook: {
          buy: aggregateLevels(data.buyOrders),
          sell: aggregateLevels(data.sellOrders),
        },
      },
    };

    return Response.json(payload, {
      headers: {
        'Cache-Control': 'public, max-age=30',
        ...getCorsHeaders(request),
      },
    });

  } catch (err: any) {
    console.error('[CF Stats Error]', err);
    return Response.json(
      { success: false, error: 'Community API unavailable' },
      { status: 502, headers: getCorsHeaders(request) }
    );
  }
};
