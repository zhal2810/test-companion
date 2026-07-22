// server.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import { handleWareraProxy, handleLiveMarketStats } from './src/utils/proxyHandler';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // CORS Configuration
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true
  }));

  app.use(express.json());

  // API ENDPOINTS

  // 1. Health & Server Info
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'WarEra Companion Proxy Server is running.' });
  });

  // 2. /api/players/:procedure (Matching functions/api/players/[procedure].ts)
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

    // Convert numeric string values to numbers for Zod compatibility
    for (const key in input) {
      if (typeof input[key] === 'string' && input[key].trim() !== '') {
        const num = Number(input[key]);
        if (!Number.isNaN(num)) {
          input[key] = num;
        }
      }
    }

    try {
      const targetUrl = `https://api2.warera.io/trpc/${procedure}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['X-API-Key'] = String(apiKey);
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });

      const json = await response.json();
      res.status(response.status).json(json);
    } catch (err: any) {
      console.error(`[Proxy Error] Failed to fetch procedure ${procedure}:`, err);
      res.status(500).json({ error: 'Gagal memanggil API WarEra', detail: err.message });
    }
  });

  // 3. /api/warera/:procedure (Alternate proxy, keeping compatibility)
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

  // 4. Live Market Stats
  app.get('/api/market/stats', async (req, res) => {
    const result = await handleLiveMarketStats();
    res.status(result.status).json(result.payload);
  });

  // 5. Market Items (getPrices shortcut)
  app.get('/api/market/items', async (req, res) => {
    try {
      const targetUrl = 'https://api2.warera.io/trpc/itemTrading.getPrices';
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await response.json();
      res.status(response.status).json(json);
    } catch (err: any) {
      res.status(502).json({ error: 'Gagal mengambil data market', detail: err.message });
    }
  });

  // 6. Pulse Market Snapshot
  app.get('/api/market/pulse-snapshot', async (req, res) => {
    try {
      const response = await fetch('https://www.warera-pulse.info/api/snapshot', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)' },
      });
      if (!response.ok) {
        return res.status(response.status).json({ success: false, error: 'Gagal mengambil snapshot market', status: response.status });
      }
      const data = await response.json();
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(502).json({ success: false, error: 'Gagal terhubung ke WarEra Pulse', detail: err.message });
    }
  });

  // 7. Pulse History / Candles
  app.get('/api/pulse/history/:item', async (req, res) => {
    const { item } = req.params;
    const tf = req.query.tf || 'week';
    try {
      const response = await fetch(`https://www.warera-pulse.info/api/history/${item}?tf=${encodeURIComponent(String(tf))}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)' },
      });
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Gagal mengambil data candle dari WarEra Pulse', status: response.status });
      }
      const data = await response.json();
      res.set('Cache-Control', 'public, max-age=60');
      res.json(data);
    } catch (err: any) {
      res.status(502).json({ error: 'Gagal terhubung ke WarEra Pulse', detail: err.message });
    }
  });

  // 7b. Pulse Live Transactions
  app.get('/api/pulse/transactions', async (req, res) => {
    const limit = req.query.limit || 100;
    try {
      const url = `https://www.warera-pulse.info/api/transactions?limit=${limit}`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)' },
      });
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Gagal mengambil data transaksi dari WarEra Pulse', status: response.status });
      }
      const data = await response.json();
      res.set('Cache-Control', 'public, max-age=5'); // Cache sangat singkat karena real-time
      res.json(data);
    } catch (err: any) {
      res.status(502).json({ error: 'Gagal terhubung ke WarEra Pulse', detail: err.message });
    }
  });

  // 8. Stats per Item / Orderbook
  app.get('/api/stats/item/:item', async (req, res) => {
    const { item } = req.params;
    try {
      const response = await fetch(`https://api.warerastats.io/item/${encodeURIComponent(item)}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      });
      if (!response.ok) {
        return res.status(response.status).json({ success: false, error: `api.warerastats.io merespons status ${response.status}` });
      }
      const data = await response.json();
      res.set('Cache-Control', 'public, max-age=30');
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(502).json({ success: false, error: 'Gagal mengambil data dari api.warerastats.io', detail: err.message });
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
