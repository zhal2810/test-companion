// server.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { handleWareraProxy, handleLiveMarketStats, callCommunity } from './src/utils/proxyHandler';

// ─── Simple File Cache ─────────────────────────────────────────────
const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'market_prices.json');
const CACHE_TTL_MS = 60_000; // 60 detik

// ─── Sumber data: API komunitas warera.realmarijn.nl (satu-satunya) ──
// api2.warera.io & gateway.warerastats.io sudah TIDAK dipakai lagi.

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
      const json = await callCommunity(procedure, input);
      if (!json) {
        return res.status(502).json({ error: `Upstream API unavailable (${procedure})` });
      }
      res.status(200).json(json);
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

      const data = await callCommunity('tradingOrder.getTopOrders', { itemCode, limit }, 5000);

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
            const userData = await callCommunity('user.getUserLite', { userId }, 4000);
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

  // 2.6 Item Offers — realized trading transactions (not pending) with user enrichment
  app.get('/api/market/offers/:itemCode', async (req, res) => {
    try {
      const { itemCode } = req.params;
      const rawLimit = Number(req.query.limit || 20);
      const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 20, 100));

      if (!itemCode) {
        return res.status(400).json({ error: "itemCode is required" });
      }

      const data = await callCommunity(
        'transaction.getPaginatedTransactions',
        { itemCode, limit, transactionType: 'trading' },
        6000,
      );

      const dataSource = 'warera.realmarijn.nl';

      const rawTransactions = Array.isArray(data?.result?.data?.items)
        ? data.result.data.items
        : [];

      if (rawTransactions.length === 0) {
        console.warn(`[Offers] No trades found for ${itemCode} from ${dataSource || 'any source'}`);
        res.set('Cache-Control', 'public, max-age=5');
        return res.json({
          success: true,
          data: [],
          count: 0,
          warning: 'No trades found or API unavailable',
          source: dataSource,
        });
      }

      const userCache = new Map<string, { username: string; avatarUrl: string }>();

      const resolveUser = async (userId: string) => {
        if (userCache.has(userId)) return;
        try {
          const userData = await callCommunity('user.getUserLite', { userId }, 4000);
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
      };

      const userIds = Array.from(
        new Set(
          rawTransactions
            .flatMap((tx: any) => [tx?.buyerId, tx?.sellerId])
            .filter(Boolean)
        )
      ) as string[];

      await Promise.all(userIds.map(resolveUser));

      const trades = rawTransactions
        .map((tx: any) => {
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
        })
        .slice(0, limit);

      res.set('Cache-Control', 'public, max-age=5');
      res.json({
        success: true,
        data: trades,
        count: trades.length,
        source: dataSource,
      });
    } catch (err: any) {
      console.error('[Offers Error]', err);
      return res.status(502).json({
        success: false,
        error: 'Failed to fetch offers',
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

  // 5. Market Items — dari API komunitas (satu-satunya sumber)
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

    // Fetch dari API komunitas
    try {
      const json = await callCommunity('itemTrading.getPrices', {});
      if (!json?.result?.data) {
        throw new Error('Community API returned no price map');
      }

      // Enrich dengan metadata
      const enriched = {
        result: { data: json.result.data },
        _meta: {
          fetchedAt: new Date().toISOString(),
          source: 'warera.realmarijn.nl',
          cached: false,
          nextRefresh: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        }
      };

      // Simpan ke cache
      await setCachedMarketData(json, 'warera.realmarijn.nl');

      res.set('Cache-Control', 'public, max-age=30');
      res.status(200).json(enriched);

    } catch (err: any) {
      console.error('[Market Proxy] Community API failed:', err);

      res.status(502).json({
        error: 'Market data currently unavailable',
        _meta: { fetchedAt: new Date().toISOString() },
      });
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
      const data: any = await response.json();
      
      // Enrich with user data if userId is present
      const transactions = Array.isArray(data?.items) ? data.items : [];
      const userIds = Array.from(
        new Set(
          transactions
            .map((t: any) => t?.userId)
            .filter(Boolean)
        )
      ) as string[];

      const userCache = new Map<string, { username: string; avatarUrl: string }>();

      // Fetch user data in parallel — dari API komunitas
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const userData = await callCommunity('user.getUserLite', { userId }, 3000);
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

      // Enrich transactions with user data
      const enrichedTransactions = transactions.map((t: any) => {
        const user = t?.userId ? userCache.get(t.userId) : undefined;
        return {
          ...t,
          username: user?.username || 'Unknown',
          avatarUrl: user?.avatarUrl || '',
        };
      });

      res.set('Cache-Control', 'public, max-age=5');
      res.json({ ...data, items: enrichedTransactions });
    } catch (err: any) {
      console.error('[Pulse Transactions Error]', err);
      res.status(502).json({ success: false, error: 'WarEra Pulse unavailable' });
    }
  });

  // 8. Stats per Item / Orderbook — dibangun dari API komunitas
  app.get('/api/stats/item/:item', async (req, res) => {
    const { item } = req.params;
    try {
      const data = await callCommunity('tradingOrder.getTopOrders', { itemCode: item, limit: 100 }, 6000);
      const orderData = data?.result?.data;

      if (!orderData) {
        return res.status(502).json({ success: false, error: 'Community API returned no order book' });
      }

      const aggregateLevels = (orders: any[]) => {
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
      };

      const payload = {
        success: true,
        data: {
          orderbook: {
            buy: aggregateLevels(orderData.buyOrders),
            sell: aggregateLevels(orderData.sellOrders),
          },
        },
      };
      res.set('Cache-Control', 'public, max-age=30');
      res.json(payload);
    } catch (err: any) {
      console.error('[Stats Error]', err);
      res.status(502).json({ success: false, error: 'Community API unavailable' });
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