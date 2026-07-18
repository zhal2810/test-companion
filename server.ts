// server.ts
import express from 'express';
import cors from 'cors';
import { handleWareraProxy, handleLiveMarketStats } from './src/utils/proxyHandler';

const app = express();
const PORT = process.env.PORT || 3001;

// Mengatasi Celah Keamanan CORS: Kunci hanya untuk origin lokal saat development
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

app.use(express.json());

// BARU: Halaman utama (mencegah error "Cannot GET /")
app.get('/', (req, res) => {
  res.json({
    status: "online",
    message: "WarEra Companion Proxy Server is running.",
    endpoints: {
      marketStats: "/api/market/stats",
      wareraProxy: "/api/warera/:procedure"
    }
  });
});

// Endpoint Live Market Stats (Solusi poin #4)
app.get('/api/market/stats', async (req, res) => {
  const result = await handleLiveMarketStats();
  res.status(result.status).json(result.payload);
});

// Jalur Proxy Utama tRPC (Solusi poin #1 & #2)
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

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});