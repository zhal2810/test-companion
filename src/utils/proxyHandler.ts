interface ProxyRequest {
  procedure: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  queryParams?: Record<string, string>;
}

// Handler utama untuk rute tRPC WarEra — sumber tunggal: API komunitas
// warera.realmarijn.nl. api2.warera.io & gateway.warerastats.io sudah TIDAK dipakai.
const COMMUNITY_API_BASE = 'https://warera.realmarijn.nl';

export async function callCommunity(
  procedure: string,
  input: unknown,
  timeoutMs = 8000,
): Promise<any | null> {  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${COMMUNITY_API_BASE}/api/proxy/${procedure}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input ?? {}),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const json: any = await response.json();
    if (json?.ok && json?.data) return json.data;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleWareraProxy(req: ProxyRequest) {
  const { procedure, body, queryParams } = req;

  const input = {
    ...(queryParams ?? {}),
    ...((body?.input ?? body) || {}),
  };

  for (const key in input) {
    if (typeof input[key] === 'string' && input[key].trim() !== '') {
      const num = Number(input[key]);
      if (!Number.isNaN(num)) input[key] = num;
    }
  }

  const json = await callCommunity(procedure, input);
  if (json) {
    return { status: 200, payload: json };
  }
  return {
    status: 502,
    payload: { success: false, error: `Failed to call WarEra API via community (${procedure})` },
  };
}

// SOLUSI POIN 4: Handler Live Call untuk Market Stats — dari API komunitas.
// itemTrading.getPrices mengembalikan map harga per item; dipetakan ke bentuk
// array { itemCode, price } yang sama seperti warerastats.io/items dulu.
export async function handleLiveMarketStats() {
  try {
    const json = await callCommunity('itemTrading.getPrices', {});
    const map = json?.result?.data;

    if (!map || typeof map !== 'object') {
      throw new Error('Community API returned no price map');
    }

    const data = Object.entries(map).map(([itemCode, price]) => ({
      itemCode,
      price: Number(price) || 0,
      avg: Number(price) || 0,
    }));

    return {
      status: 200,
      payload: { success: true, data },
    };
  } catch (err: any) {
    return {
      status: 502,
      payload: { success: false, error: 'Failed to fetch live market stats from community API' },
    };
  }
}
