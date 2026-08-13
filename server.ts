// server.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { handleWareraProxy, handleLiveMarketStats } from './src/utils/proxyHandler';

// ─── Simple File Cache ─────────────────────────────────────────────
const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'market_prices.json');
const CACHE_TTL_MS = 60_000; // 60 detik

interface MarketResponse {
  [key: string]: any;
  _meta?: {
    fetchedAt?: string;
    source?: string;
    cached?: boolean;
    [key: string]: any;
  };
}

interface MarketCache {
  data: any;
  fetchedAt: string;
  source: string;
}

async function getCachedMarketData(): Promise<MarketCache | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache: MarketCache = JSON.parse(raw);
    const age = Date.now() - new Date(cache.fetchedAt).getTime();
    return age < CACHE_TTL_MS ? cache : null;
  } catch {
    return null;
  }
}

async function setCachedMarketData(data: any, source: string) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify({
    data,
    fetchedAt: new Date().toISOString(),
    source,
  }, null, 2));
}

// ─── Server ────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // ✅ FIX #1: CORS yang aman (jangan wildcard + credentials)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  }));

  app.use(express.json());

  // 1. Health
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'WarEra Companion Proxy Server is running.' });
  });

  // 2. Players Proxy
  app.all('/api/players/:procedure', async (req, res) => {
    const { procedure } = req.params;
    const apiKey = req.headers['x-api-key'] || req.headers['authorization'];

    let rawInput: Record<string, any> = {};
    if (req.method === 'GET') {
      rawInput = req.query as Record<string, any>;
    } else {
      rawInput = req.body?.input ?? req.body ?? {};
    }

    const input: Record<string, any> = { ...rawInput };
    for (const key in input) {
      if (typeof input[key] === 'string' && input[key].trim() !== '') {
        const num = Number(input[key]);
        if (!Number.isNaN(num)) input[key] = num;
      }
    }

    try {
      const targetUrl = `https://api2.warera.io/trpc/${procedure}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = String(apiKey);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });

      const json = await response.json();
      res.status(response.status).json(json);
    } catch (err: any) {
      console.error(`[Proxy Error] Failed to fetch procedure ${procedure}:`, err);
      // ✅ FIX #2: Jangan kirim detail error ke client
      res.status(502).json({ error: 'Upstream API unavailable' });
    }
  });


  // 2.5 Market BID/OFFER — proxy + username enrichment
  app.get('/api/warera/orders', async (req, res) => {
    try {
      const itemCode = String(req.query.itemCode || '').trim();
      const rawLimit = Number(req.query.limit || 30);
      const limit = Math.max(
        1,
        Math.min(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 30, 100)
      );

      if (!itemCode) {
        return res.status(400).json({
          error: "Query parameter 'itemCode' is required",
        });
      }

      const input = encodeURIComponent(JSON.stringify({ itemCode, limit }));

      const fetchTRPC = async (url: string, headers: Record<string, string> = {}) => {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'WarEra-Companion/1.0',
            ...headers,
          },
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
        return await response.json();
      };

      let data: any = null;

      try {
        data = await fetchTRPC(
          `https://gateway.warerastats.io/trpc/tradingOrder.getTopOrders?input=${input}`,
          { 'X-API-Key': 'warerastats' }
        );
      } catch {
        // fallback
      }

      if (!data) {
        try {
          data = await fetchTRPC(
            `https://api2.warera.io/trpc/tradingOrder.getTopOrders?input=${input}`
          );
        } catch {
          // fallback berikutnya
        }
      }

      if (!data) {
        data = await fetchTRPC(
          `https://www.warera-pulse.info/api/wr/tradingOrder.getTopOrders?input=${input}`
        );
      }

      const buyOrders = Array.isArray(data?.result?.data?.buyOrders)
        ? data.result.data.buyOrders
        : [];
      const sellOrders = Array.isArray(data?.result?.data?.sellOrders)
        ? data.result.data.sellOrders
        : [];

      const userIds = Array.from(
        new Set(
          [...buyOrders, ...sellOrders]
            .map((o: any) => o?.user)
            .filter(Boolean)
        )
      ) as string[];

      const userCache = new Map<string, { username: string; avatarUrl: string }>();

      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const userInput = encodeURIComponent(JSON.stringify({ userId }));
            let userData: any = null;

            try {
              userData = await fetchTRPC(
                `https://gateway.warerastats.io/trpc/user.getUserLite?input=${userInput}`,
                { 'X-API-Key': 'warerastats' }
              );
            } catch {
              try {
                userData = await fetchTRPC(
                  `https://api2.warera.io/trpc/user.getUserLite?input=${userInput}`
                );
              } catch {
                userData = null;
              }
            }

            const user = userData?.result?.data;

            userCache.set(userId, {
              username: user?.username || `${userId.slice(0, 8)}...`,
              avatarUrl: user?.avatarUrl || '',
            });
          } catch {
            userCache.set(userId, {
              username: `${userId.slice(0, 8)}...`,
              avatarUrl: '',
            });
          }
        })
      );

      const enrich = (order: any) => {
        const user = order?.user ? userCache.get(order.user) : undefined;
        return {
          ...order,
          username:
            user?.username ||
            (order?.user ? `${String(order.user).slice(0, 8)}...` : 'Unknown'),
          avatarUrl: user?.avatarUrl || '',
        };
      };

      res.set('Cache-Control', 'public, max-age=5');
      return res.json({
        result: {
          data: {
            buyOrders: buyOrders.map(enrich),
            sellOrders: sellOrders.map(enrich),
          },
        },
      });
    } catch (err: any) {
      console.error('[Orders Proxy]', err);
      return res.status(502).json({
        error: 'Failed to fetch market orders',
        details: err?.message || 'Unknown error',
      });
    }
  });

  // 3. Warera Alternate Proxy
  app.all('/api/warera/:procedure', async (req, res) => {
    const result = await handleWareraProxy({
      procedure: req.params.procedure,
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.body,
      queryParams: req.query as Record<string, string>,
    });
    res.status(result.status).json(result.payload);
  });

  // 4. Live Market Stats (warerastats.io)
  app.get('/api/market/stats', async (req, res) => {
    const result = await handleLiveMarketStats();
    res.status(result.status).json(result.payload);
  });

  // 5. Market Items — ✅ FIX #3: GET + Cache + Fallback
  app.get('/api/market/items', async (req, res) => {
    // Cek cache dulu
    const cached = await getCachedMarketData();
    if (cached) {
      return res.json({
        ...cached.data,
        _meta: {
          fetchedAt: cached.fetchedAt,
          source: cached.source,
          cached: true,
          nextRefresh: new Date(new Date(cached.fetchedAt).getTime() + CACHE_TTL_MS).toISOString(),
        }
      });
    }

    // Fetch dari official API
    try {
      const targetUrl = 'https://api2.warera.io/trpc/itemTrading.getPrices';
      const response = await fetch(targetUrl, {
        method: 'GET',                          // ✅ FIX: GET, bukan POST
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        // ✅ FIX: NO body untuk GET
      });

      if (!response.ok) {
        throw new Error(`WarEra API returned ${response.status}`);
      }

      const json = await response.json();

      // Enrich dengan metadata
      const json = await response.json() as Record<string, any>; // ✅ tambahkan `as Record<string, any>`
      const enriched = {
        ...json, // sekarang bisa di-spread
        _meta: {
          fetchedAt: new Date().toISOString(),
          source: 'api2.warera.io',
          cached: false,
          nextRefresh: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        }
      };

      // Simpan ke cache
      await setCachedMarketData(json, 'api2.warera.io');

      res.set('Cache-Control', 'public, max-age=30');
      res.status(200).json(enriched);

    } catch (err: any) {
      console.error('[Market Proxy] Official API failed:', err);

      // ✅ FIX #4: Fallback ke warerastats.io
      try {
        const fallback = await fetch('https://api.warerastats.io/items', {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)',
          },
        });

        if (!fallback.ok) throw new Error(`Fallback returned ${fallback.status}`);

        const data = await fallback.json() as Record<string, any>; // ✅ tambahkan `as Record<string, any>`
        const enriched = {
          ...data, // sekarang bisa di-spread
          _meta: {
            fetchedAt: new Date().toISOString(),
            source: 'api.warerastats.io (fallback)',
            warning: 'Official API unavailable, showing mirror data',
          }
        };

        await setCachedMarketData(data, 'api.warerastats.io');
        res.json(enriched);

      } catch (fallbackErr: any) {
        console.error('[Market Proxy] Fallback also failed:', fallbackErr);
        res.status(502).json({
          error: 'Market data currently unavailable',
          _meta: { fetchedAt: new Date().toISOString() },
        });
      }
    }
  });

  // 6. Pulse Market Snapshot
  app.get('/api/market/pulse-snapshot', async (req, res) => {
    try {
      const response = await fetch('https://www.warera-pulse.info/api/snapshot', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)' },
      });
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: 'Failed to fetch snapshot',
        });
      }
      const data = await response.json();
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ success: true, data });
    } catch (err: any) {
      console.error('[Pulse Snapshot Error]', err);
      res.status(502).json({ success: false, error: 'WarEra Pulse unavailable' });
    }
  });

  // 7. Pulse History / Candles
  app.get('/api/pulse/history/:item', async (req, res) => {
    const { item } = req.params;
    const tf = req.query.tf || 'week';
    try {
      const response = await fetch(
        `https://www.warera-pulse.info/api/history/${encodeURIComponent(item)}?tf=${encodeURIComponent(String(tf))}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)' } }
      );
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: 'Failed to fetch candle data',
        });
      }
      const data = await response.json();
      res.set('Cache-Control', 'public, max-age=60');
      res.json(data);
    } catch (err: any) {
      console.error('[Pulse History Error]', err);
      res.status(502).json({ success: false, error: 'WarEra Pulse unavailable' });
    }
  });

  // 7b. Pulse Live Transactions
  app.get('/api/pulse/transactions', async (req, res) => {
    const limit = req.query.limit || 100;
    try {
      const url = `https://www.warera-pulse.info/api/transactions?limit=${encodeURIComponent(String(limit))}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)' },
      });
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: 'Failed to fetch transactions',
        });
      }
      const data = await response.json();
      res.set('Cache-Control', 'public, max-age=5');
      res.json(data);
    } catch (err: any) {
      console.error('[Pulse Transactions Error]', err);
      res.status(502).json({ success: false, error: 'WarEra Pulse unavailable' });
    }
  });

  // 8. Stats per Item / Orderbook
  app.get('/api/stats/item/:item', async (req, res) => {
    const { item } = req.params;
    try {
      const response = await fetch(
        `https://api.warerastats.io/item/${encodeURIComponent(item)}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)',
          },
        }
      );
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: `warerastats.io returned ${response.status}`,
        });
      }
      const data = await response.json();
      res.set('Cache-Control', 'public, max-age=30');
      res.json({ success: true, data });
    } catch (err: any) {
      console.error('[Stats Error]', err);
      res.status(502).json({ success: false, error: 'warerastats.io unavailable' });
    }
  });

  // INTEGRATE VITE MIDDLEWARE
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Proxy & Web server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});