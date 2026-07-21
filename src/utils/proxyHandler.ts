interface ProxyRequest {
  procedure: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  queryParams?: Record<string, string>;
}

// Handler utama untuk rute tRPC official WarEra
export async function handleWareraProxy(req: ProxyRequest) {
  const { procedure, method, headers, body, queryParams } = req;
  
  const baseUrl = `https://api2.warera.io/trpc/${encodeURIComponent(procedure)}`;
  const url = new URL(baseUrl);
  
  if (queryParams) {
    Object.keys(queryParams).forEach(key => 
      url.searchParams.append(key, queryParams[key])
    );
  }

  const forwardHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (headers['authorization']) forwardHeaders['authorization'] = headers['authorization'];
  if (headers['x-api-key']) forwardHeaders['x-api-key'] = headers['x-api-key'];

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: forwardHeaders,
      body: method !== 'GET' && method !== 'HEAD' && body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    return { status: response.status, payload: data };
  } catch (err: any) {
    return {
      status: 500,
      payload: { success: false, error: 'Internal Proxy Error' }
    };
  }
}

// SOLUSI POIN 4: Handler Live Call untuk Market Stats (Menggantikan file temp_warera_stats.json)
export async function handleLiveMarketStats() {
  try {
    // Mengambil data real-time langsung dari API mirror pihak ketiga
    const response = await fetch('https://api.warerastats.io/items', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)'
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream returned status ${response.status}`);
    }

    const data = await response.json();
    return {
      status: 200,
      payload: { success: true, data }
    };
  } catch (err: any) {
    return {
      status: 502, // Bad Gateway karena upstream/pihak ketiga bermasalah
      payload: { success: false, error: 'Failed to fetch live market stats from third-party API' }
    };
  }
}