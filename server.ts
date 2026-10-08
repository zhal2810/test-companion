// server.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
dotenv.config(); // SUPABASE_URL / SUPABASE_SERVICE_KEY lokal via .env (gitignored)
import { handleWareraProxy, handleLiveMarketStats, callCommunity } from './src/utils/proxyHandler';

// ─── Simple File Cache ─────────────────────────────────────────────
const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'market_prices.json');
const CACHE_TTL_MS = 60_000; // 60 detik

// ─── Sumber data: API komunitas warera.realmarijn.nl (satu-satunya) ──
// api2.warera.io & gateway.warerastats.io sudah TIDAK dipakai lagi.

// ─── UserLite cache + throttle (hindari 429 Cloudflare) ──
const USER_LITE_TTL_MS = 5 * 60 * 1000; // 5 menit
const USER_LITE_CONCURRENCY = 5;
const USER_LITE_DELAY_MS = 120;
const userLiteCache = new Map<string, { username: string; avatarUrl: string; fetchedAt: number }>();

async function fetchUserLiteThrottled(userIds: string[]): Promise<Map<string, { username: string; avatarUrl: string }>> {
  const result = new Map<string, { username: string; avatarUrl: string }>();
  // isi dari cache dulu
  const toFetch: string[] = [];
  for (const id of userIds) {
    const cached = userLiteCache.get(id);
    if (cached && Date.now() - cached.fetchedAt < USER_LITE_TTL_MS) {
      result.set(id, { username: cached.username, avatarUrl: cached.avatarUrl });
    } else {
      toFetch.push(id);
    }
  }
  if (toFetch.length === 0) return result;

  // batch 5 concurrent + delay antar batch
  for (let i = 0; i < toFetch.length; i += USER_LITE_CONCURRENCY) {
    const batch = toFetch.slice(i, i + USER_LITE_CONCURRENCY);
    await Promise.all(batch.map(async (userId) => {
      try {
        // retry 429 sekali
        let data: any = await callCommunity('user.getUserLite', { userId }, 4000);
        if (!data) {
          await new Promise(r => setTimeout(r, 800));
          data = await callCommunity('user.getUserLite', { userId }, 4000);
        }
        const user = data?.result?.data;
        const entry = {
          username: user?.username || `${userId.slice(0, 8)}...`,
          avatarUrl: user?.avatarUrl || '',
        };
        userLiteCache.set(userId, { ...entry, fetchedAt: Date.now() });
        result.set(userId, entry);
      } catch {
        const fallback = { username: `${userId.slice(0, 8)}...`, avatarUrl: '' };
        result.set(userId, fallback);
      }
    }));
    if (i + USER_LITE_CONCURRENCY < toFetch.length) {
      await new Promise(r => setTimeout(r, USER_LITE_DELAY_MS));
    }
  }
  return result;
}

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
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
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
        const v = input[key].trim().toLowerCase();
        if (v === 'true' || v === 'false') {
          input[key] = v === 'true';
        } else {
          const num = Number(input[key]);
          if (!Number.isNaN(num)) input[key] = num;
        }
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


  // 2.4 Oil Maintenance — konsumsi Oil (Bunker + Pacification Center) per region
  const OIL_MAINT_CACHE_FILE = path.join(CACHE_DIR, 'oil_maintenance.json');
  const OIL_MAINT_TTL_MS = 120_000; // 2 menit

  app.get('/api/tracker/oil-maintenance', async (req, res) => {
    const countryId = String(req.query.countryId || '6813b6d546e731854c7ac829');
    try {
      // Cache file sederhana (mirip market prices)
      try {
        const raw = await fs.readFile(OIL_MAINT_CACHE_FILE, 'utf-8');
        const c = JSON.parse(raw);
        const age = Date.now() - new Date(c.fetchedAt).getTime();
        if (age < OIL_MAINT_TTL_MS && c.countryId === countryId) {
          return res.json(c.payload);
        }
      } catch { /* cache miss */ }

      const BUNKER_SCALE: Record<number, number> = { 1: 0.04, 2: 0.08, 3: 0.16, 4: 0.32, 5: 0.64 };
      const BUNKER_MIN: Record<number, number> = { 1: 1, 2: 2, 3: 5, 4: 10, 5: 25 };
      const PC_SCALE: Record<number, number> = { 1: 0.05, 2: 0.1, 3: 0.2, 4: 0.4, 5: 0.8 };
      const PC_MIN: Record<number, number> = { 1: 1, 2: 2, 3: 5, 4: 10, 5: 25 };

      const regionJson = await callCommunity('region.getAll', {});
      const regionsAll = Array.isArray(regionJson?.result?.data) ? regionJson.result.data : [];
      const countryRegions = regionsAll.filter((r: any) => r?.country === countryId);

      const countryJson = await callCommunity('country.getCountryById', { countryId });
      const averageDevelopment = Number(countryJson?.result?.data?.averageDevelopment) || 0;

      const pricesJson = await callCommunity('itemTrading.getPrices', {});
      const prices: Record<string, any> = pricesJson?.result?.data ?? {};
      const oilPrice = Number(prices?.oil) || Number(prices?.Oil) || 0;

      const fetchUpgrade = async (upgradeType: string, regionId: string, attempts = 3) => {
        for (let i = 0; i < attempts; i++) {
          try {
            const j = await callCommunity('upgrade.getUpgradeByTypeAndEntity', { upgradeType, regionId });
            if (j?.result?.data) return j.result.data;
          } catch { /* retry */ }
          if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300));
        }
        return null;
      };

      const round = (v: number, d: number) => {
        const f = Math.pow(10, d);
        return Math.round(v * f) / f;
      };

      const regions = [];
      for (const r of countryRegions) {
        const [bunker, pc] = await Promise.all([
          fetchUpgrade('bunker', r._id),
          fetchUpgrade('pacificationCenter', r._id),
        ]);
        const bunkerLevel = Number(bunker?.level) || 0;
        const bunkerStatus = bunker?.status === 'active' ? 'active' : bunker?.status === 'pending' ? 'activating' : 'off';
        const pcLevel = Number(pc?.level) || 0;
        const pcStatus = pc?.status === 'active' ? 'active' : pc?.status === 'pending' ? 'activating' : 'off';
        const bunkerOil = bunkerStatus === 'active' && bunkerLevel > 0
          ? Math.max(BUNKER_MIN[bunkerLevel] ?? 0, (BUNKER_SCALE[bunkerLevel] ?? 0) * averageDevelopment)
          : 0;
        const pcOil = pcStatus === 'active' && pcLevel > 0
          ? Math.max(PC_MIN[pcLevel] ?? 0, (PC_SCALE[pcLevel] ?? 0) * Number(r.development))
          : 0;
        const oilPerHour = bunkerOil + pcOil;
        regions.push({
          regionId: r._id,
          code: r.code || '',
          name: r.name || r.code || '',
          development: Number(r.development) || 0,
          bunkerLevel,
          bunkerStatus,
          pacificationCenterLevel: pcLevel,
          pacificationCenterStatus: pcStatus,
          oilPerHour: round(oilPerHour, 1),
          goldPerHour: round(oilPerHour * oilPrice, 2),
        });
      }

      const counts = { active: 0, activating: 0, off: 0 };
      let totalOilPerHour = 0;
      let totalGoldPerHour = 0;
      for (const r of regions) {
        counts.active += r.bunkerStatus === 'active' ? 1 : 0;
        counts.active += r.pacificationCenterStatus === 'active' ? 1 : 0;
        counts.activating += r.bunkerStatus === 'activating' ? 1 : 0;
        counts.activating += r.pacificationCenterStatus === 'activating' ? 1 : 0;
        counts.off += r.bunkerStatus === 'off' ? 1 : 0;
        counts.off += r.pacificationCenterStatus === 'off' ? 1 : 0;
        totalOilPerHour += r.oilPerHour;
        totalGoldPerHour += r.goldPerHour;
      }

      const payload = {
        success: true,
        data: {
          countryId,
          oilPrice: round(oilPrice, 4),
          averageDevelopment: round(averageDevelopment, 2),
          fetchedAt: new Date().toISOString(),
          regions: regions.sort((a: any, b: any) => {
            const rank = (s: string) => (s === 'active' ? 0 : s === 'activating' ? 1 : 2);
            return rank(a.bunkerStatus) - rank(b.bunkerStatus) || a.name.localeCompare(b.name);
          }),
          counts,
          totalOilPerHour: round(totalOilPerHour, 1),
          totalGoldPerHour: round(totalGoldPerHour, 2),
        },
      };

      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(OIL_MAINT_CACHE_FILE, JSON.stringify({ countryId, fetchedAt: new Date().toISOString(), payload }, null, 2));
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(payload);
    } catch (err: any) {
      console.error('[Oil Maintenance Error]', err);
      return res.status(502).json({ success: false, error: 'Gagal mengambil data maintenance oil' });
    }
  });

  // 2.4.1 Tracker Transactions — riwayat transaksi per negara
  app.get('/api/tracker/transactions', async (req, res) => {
    const countryId = String(req.query.countryId || '6813b6d546e731854c7ac829');
    const transactionType = String(req.query.transactionType || '') || undefined;
    try {
      const all: any[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 200; page++) {
        const input: Record<string, any> = { countryId, limit: 100 };
        if (transactionType) input.transactionType = transactionType;
        if (cursor) input.cursor = cursor;

        const json = await callCommunity('transaction.getPaginatedTransactions', input);
        const data = json?.result?.data;
        const items = Array.isArray(data?.items) ? data.items : [];
        all.push(...items);
        cursor = data?.nextCursor || null;
        if (!cursor) break;
      }

      const toNum = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

      const transactions = all.map((t: any) => ({
        _id: t?._id || '',
        itemCode: t?.itemCode || '',
        money: toNum(t?.money),
        quantity: toNum(t?.quantity),
        unitPrice: toNum(t?.quantity) > 0 ? toNum(t?.money) / toNum(t?.quantity) : 0,
        sellerId: t?.sellerId || '',
        buyerId: t?.buyerId || '',
        sellerName: '',
        buyerName: '',
        sellerCountryId: t?.sellerCountryId || '',
        buyerCountryId: t?.buyerCountryId || '',
        transactionType: t?.transactionType || '',
        createdAt: t?.createdAt || t?.offerCreatedAt || '',
      }));

      res.json({
        success: true,
        data: { countryId, fetchedAt: new Date().toISOString(), total: transactions.length, transactions },
      });
    } catch (err: any) {
      console.error('[Tracker Transactions] Error:', err);
      res.status(502).json({ success: false, error: 'Gagal mengambil data transaksi negara' });
    }
  });

  // ─── Helper tracker mingguan (Senin 00:00 UTC) + Supabase REST (dev) ──
  function mondayDev(input: string | Date): string {
    const d = new Date(input);
    const diff = (d.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff)).toISOString().slice(0, 10);
  }
  async function sbDev(sbUrl: string, sbKey: string, path: string): Promise<any[]> {
    const r = await fetch(`${sbUrl}/rest/v1/${path}`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  }
  async function sbDevUpsert(sbUrl: string, sbKey: string, table: string, rows: Record<string, any>[], onConflict: string, merge: boolean): Promise<any[]> {
    if (rows.length === 0) return [];
    const r = await fetch(`${sbUrl}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: `${merge ? 'resolution=merge-duplicates' : 'resolution=ignore-duplicates'},return=representation` },
      body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`Supabase upsert ${r.status}`);
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  }

  // 2.4.2 Tracker Donations (dev mirror: EVENT-based, transactionType=donation)
  app.get('/api/tracker/donations', async (req, res) => {
    const countryId = String(req.query.countryId || '6813b6d546e731854c7ac829');
    const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.weekStart || '')) ? String(req.query.weekStart) : mondayDev(new Date());
    try {
      const ws = new Date(`${weekStart}T00:00:00.000Z`).getTime();
      const we = ws + 7 * 86400000;
      const wDate = new Date(ws);
      const monthStart = Date.UTC(wDate.getUTCFullYear(), wDate.getUTCMonth(), 1);
      const stopAt = Math.min(ws, monthStart);
      const events: { money: number; time: number; donorId: string }[] = [];
      let cursor: string | null = null;
      let pagesUsed = 0;
      for (let page = 0; page < 80; page++) {
        const input: Record<string, any> = { countryId, transactionType: 'donation', limit: 100 };
        if (cursor) input.cursor = cursor;
        let json: any = null;
        try { json = await callCommunity('transaction.getPaginatedTransactions', input, 8000); } catch { json = null; }
        if (!json) break;
        const items = Array.isArray(json?.result?.data?.items) ? json.result.data.items : [];
        if (items.length === 0) break;
        pagesUsed++;
        let reachedStop = false;
        for (const tx of items) {
          const t = new Date(tx?.createdAt || 0).getTime();
          if (!Number.isFinite(t)) continue;
          if (t < stopAt) { reachedStop = true; break; }
          const money = Number(tx?.money) || 0;
          if (!(money > 0)) continue;
          events.push({ money, time: t, donorId: String(tx?.buyerId || tx?.sellerId || '') });
        }
        if (reachedStop) break;
        cursor = json?.result?.data?.nextCursor || null;
        if (!cursor) break;
      }
      const daily = Array.from({ length: 7 }, (_, i) => ({ date: new Date(ws + i * 86400000).toISOString().slice(0, 10), total: 0, count: 0 }));
      let weekTotal = 0, weekCount = 0, monthTotal = 0, monthCount = 0;
      const donorMap = new Map<string, { total: number; count: number; lastAt: number }>();
      for (const e of events) {
        const d = new Date(e.time);
        if (d.getUTCFullYear() === wDate.getUTCFullYear() && d.getUTCMonth() === wDate.getUTCMonth()) { monthTotal += e.money; monthCount++; }
        if (e.time < ws || e.time >= we) continue;
        weekTotal += e.money; weekCount++;
        const idx = Math.floor((e.time - ws) / 86400000);
        if (idx >= 0 && idx < 7) { daily[idx].total += e.money; daily[idx].count++; }
        if (e.donorId) {
          let en = donorMap.get(e.donorId);
          if (!en) { en = { total: 0, count: 0, lastAt: 0 }; donorMap.set(e.donorId, en); }
          en.total += e.money; en.count++; en.lastAt = Math.max(en.lastAt, e.time);
        }
      }
      const ranked = [...donorMap.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 50);
      const nameMap = await fetchUserLiteThrottled(ranked.slice(0, 30).map(([uid]) => uid));
      res.json({
        success: true,
        data: {
          countryId, weekStart, fetchedAt: new Date().toISOString(), pagesUsed,
          week: { total: weekTotal, count: weekCount, donors: donorMap.size, daily },
          month: { month: `${wDate.getUTCFullYear()}-${String(wDate.getUTCMonth() + 1).padStart(2, '0')}`, total: monthTotal, count: monthCount },
          topDonors: ranked.map(([userId, e]) => ({ userId, username: nameMap.get(userId)?.username || '', avatarUrl: nameMap.get(userId)?.avatarUrl || '', total: e.total, count: e.count, lastAt: new Date(e.lastAt).toISOString() })),
          recent: events.filter((e) => e.time >= ws && e.time < we).sort((a, b) => b.time - a.time).slice(0, 30)
            .map((e) => ({ donorId: e.donorId, donorName: nameMap.get(e.donorId)?.username || '', donorAvatar: nameMap.get(e.donorId)?.avatarUrl || '', money: e.money, at: new Date(e.time).toISOString() })),
        },
      });
    } catch (err: any) {
      console.error('[Tracker Donations] Error:', err);
      res.status(502).json({ success: false, error: 'Gagal mengambil data donasi' });
    }
  });

  // 2.4.3 Tracker Market Tax (dev mirror of functions/api/tracker/market-tax.ts)
  app.get('/api/tracker/market-tax', async (req, res) => {
    const countryId = String(req.query.countryId || '6813b6d546e731854c7ac829');
    const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.weekStart || '')) ? String(req.query.weekStart) : mondayDev(new Date());
    let cursor: string | null = (req.query.cursor as string) || null;
    const pages = Math.max(1, Math.min(40, Number(req.query.pages) || 25));
    const sbUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const sbKey = process.env.SUPABASE_SERVICE_KEY || '';
    if (!sbUrl || !sbKey) return res.status(500).json({ success: false, error: 'SUPABASE_URL / SUPABASE_SERVICE_KEY belum di-set (.env)' });
    try {
      const nowIso = new Date().toISOString();
      const weekStartMs = new Date(`${weekStart}T00:00:00.000Z`).getTime();
      let citizenRows: any[] = await sbDev(sbUrl, sbKey, `country_citizens?country_id=eq.${countryId}&select=user_id,username,fetched_at`).catch(() => []);
      const newestFetch = citizenRows.reduce((m: number, r: any) => Math.max(m, new Date(r.fetched_at || 0).getTime()), 0);
      let citizenStale = false;
      if (citizenRows.length === 0 || Date.now() - newestFetch > 86400000) {
        try {
          const spy = await fetch('https://spywarera.com/countries/indonesia', { headers: { 'X-Inertia': 'true', 'X-Inertia-Version': '6a7d711f474908a8ccf2e6a0923e8865', 'X-Inertia-Partial-Data': 'citizens', 'X-Inertia-Partial-Component': 'Countries/Show', Accept: 'application/json' } });
          if (!spy.ok) throw new Error(`spywarera ${spy.status}`);
          const sj: any = await spy.json();
          const list = Array.isArray(sj?.props?.citizens) ? sj.props.citizens : [];
          if (list.length > 0) {
            await sbDevUpsert(sbUrl, sbKey, 'country_citizens', list.filter((c: any) => c?.player_warera_id).map((c: any) => ({ country_id: countryId, user_id: String(c.player_warera_id), username: c.username || c.display_name || '', fetched_at: nowIso })), 'country_id,user_id', true).catch(() => null);
            citizenRows = await sbDev(sbUrl, sbKey, `country_citizens?country_id=eq.${countryId}&select=user_id,username,fetched_at`).catch(() => citizenRows);
          } else citizenStale = citizenRows.length > 0;
        } catch {
          if (citizenRows.length === 0) return res.status(502).json({ success: false, error: 'Gagal memuat daftar citizen' });
          citizenStale = true;
        }
      }
      const citizenNames = new Map<string, string>();
      for (const r of citizenRows) citizenNames.set(String(r.user_id), String(r.username || ''));
      let rate = 1;
      try {
        const cj = await callCommunity('country.getCountryById', { countryId }, 6000);
        const t = Number(cj?.result?.data?.taxes?.market);
        if (Number.isFinite(t) && t > 0) rate = t;
      } catch { /* default */ }
      const matched: Record<string, any>[] = [];
      let done = false, scanned = 0;
      let oldestSeen: string | null = null;
      for (let page = 0; page < pages; page++) {
        const input: Record<string, any> = { transactionType: 'itemMarket', limit: 100 };
        if (cursor) input.cursor = cursor;
        let json: any = null;
        try {
          json = await callCommunity('transaction.getPaginatedTransactions', input, 8000);
        } catch { json = null; }
        if (!json) {
          try {
            await new Promise((r) => setTimeout(r, 500));
            json = await callCommunity('transaction.getPaginatedTransactions', input, 8000);
          } catch { json = null; }
          if (!json) break; // gagal fetch — jangan tandai done, poll berikutnya lanjutkan
        }
        const items = Array.isArray(json?.result?.data?.items) ? json.result.data.items : [];
        if (items.length === 0) {
          const next = json?.result?.data?.nextCursor || null;
          if (!next) { done = true; break; }
          cursor = next; // halaman kosong sesaat — lanjut, bukan selesai
          continue;
        }
        for (const tx of items) {
          const created = String(tx?.createdAt || '');
          const t = new Date(created).getTime();
          if (!Number.isFinite(t)) continue;
          oldestSeen = created;
          if (t < weekStartMs) { done = true; break; }
          scanned++;
          const sid = String(tx?.sellerId || '');
          if (!sid || !citizenNames.has(sid)) continue;
          const money = Number(tx?.money) || 0;
          if (!(money > 0)) continue;
          const soldAt = new Date(t).toISOString();
          const d = new Date(t);
          const ws = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
          matched.push({ tx_id: String(tx?._id || ''), country_id: countryId, item_code: String(tx?.itemCode || ''), money, tax: money * (rate / 100), seller_id: sid, seller_name: citizenNames.get(sid) || '', buyer_id: String(tx?.buyerId || ''), sold_at: soldAt, week_start: ws, inserted_at: nowIso });
        }
        if (done) break;
        cursor = json?.result?.data?.nextCursor || null;
        if (!cursor) { done = true; break; }
      }
      const inserted: any[] = await sbDevUpsert(sbUrl, sbKey, 'market_tx', matched, 'tx_id', false).catch(() => []) || [];
      const byWeek = new Map<string, { volume: number; tax: number; sellers: Set<string>; count: number }>();
      for (const row of inserted) {
        const w = String(row.week_start);
        let b = byWeek.get(w);
        if (!b) { b = { volume: 0, tax: 0, sellers: new Set(), count: 0 }; byWeek.set(w, b); }
        b.volume += Number(row.money) || 0;
        b.tax += Number(row.tax) || 0;
        b.sellers.add(String(row.seller_id));
        b.count++;
      }
      for (const [w, b] of byWeek) {
        try {
          const existing: any[] = await sbDev(sbUrl, sbKey, `weekly_tax?country_id=eq.${countryId}&week_start=eq.${w}&select=total_tax,total_volume,tx_count`);
          const cur = existing[0] || { total_tax: 0, total_volume: 0, tx_count: 0 };
          const sellerRows: any[] = await sbDev(sbUrl, sbKey, `market_tx?country_id=eq.${countryId}&week_start=eq.${w}&select=seller_id&limit=2000`).catch(() => []);
          await sbDevUpsert(sbUrl, sbKey, 'weekly_tax', [{ country_id: countryId, week_start: w, total_tax: Number(cur.total_tax || 0) + b.tax, total_volume: Number(cur.total_volume || 0) + b.volume, tx_count: Number(cur.tx_count || 0) + b.count, seller_count: new Set(sellerRows.map((r: any) => String(r.seller_id))).size, rate, updated_at: nowIso }], 'country_id,week_start', true);
        } catch { /* lanjut */ }
      }
      const aggRows: any[] = await sbDev(sbUrl, sbKey, `weekly_tax?country_id=eq.${countryId}&week_start=eq.${weekStart}&select=total_tax,total_volume,tx_count,seller_count,updated_at`).catch(() => []);
      const agg = aggRows[0] || { total_tax: 0, total_volume: 0, tx_count: 0, seller_count: 0, updated_at: null };
      const weekRows: any[] = await sbDev(sbUrl, sbKey, `market_tx?country_id=eq.${countryId}&week_start=eq.${weekStart}&select=tx_id,item_code,money,tax,seller_id,seller_name,sold_at&order=sold_at.desc&limit=5000`).catch(() => []);
      const sellerMap = new Map<string, { name: string; tx: number; volume: number; tax: number }>();
      for (const r of weekRows) {
        const sid = String(r.seller_id);
        let e = sellerMap.get(sid);
        if (!e) { e = { name: String(r.seller_name || sid.slice(0, 8)), tx: 0, volume: 0, tax: 0 }; sellerMap.set(sid, e); }
        e.tx++; e.volume += Number(r.money) || 0; e.tax += Number(r.tax) || 0;
      }
      const weeks: any[] = await sbDev(sbUrl, sbKey, `weekly_tax?country_id=eq.${countryId}&select=week_start,total_tax,tx_count&order=week_start.desc&limit=26`).catch(() => []);
      const topIds: string[] = [...sellerMap.entries()].sort((a, b) => b[1].tax - a[1].tax).slice(0, 30).map(([sid]) => sid);
      const recentIds: string[] = weekRows.slice(0, 30).map((r: any) => String(r.seller_id));
      const avatarIds = [...new Set<string>([...topIds, ...recentIds])].slice(0, 30);
      const avatarMap = await fetchUserLiteThrottled(avatarIds);
      res.json({
        success: true,
        data: {
          countryId, weekStart, weekEnd: new Date(weekStartMs + 7 * 86400000).toISOString().slice(0, 10),
          rate, citizenCount: citizenNames.size, citizenStale,
          aggregate: { totalTax: Number(agg.total_tax) || 0, totalVolume: Number(agg.total_volume) || 0, txCount: Number(agg.tx_count) || 0, sellerCount: Number(agg.seller_count) || 0, updatedAt: agg.updated_at || null },
          topSellers: [...sellerMap.entries()].map(([sellerId, e]) => ({ sellerId, ...e, avatarUrl: avatarMap.get(sellerId)?.avatarUrl || '' })).sort((a, b) => b.tax - a.tax).slice(0, 15),
          recent: weekRows.slice(0, 30).map((r: any) => ({ txId: r.tx_id, itemCode: r.item_code, money: Number(r.money) || 0, tax: Number(r.tax) || 0, sellerId: r.seller_id, sellerName: r.seller_name, sellerAvatar: avatarMap.get(String(r.seller_id))?.avatarUrl || '', soldAt: r.sold_at })),
          ingest: { done, nextCursor: done ? null : cursor, scanned, newRows: inserted.length, oldestSeen },
          weeks: weeks.map((w: any) => ({ weekStart: w.week_start, totalTax: Number(w.total_tax) || 0, txCount: Number(w.tx_count) || 0 })),
          fetchedAt: nowIso,
        },
      });
    } catch (err: any) {
      console.error('[Tracker MarketTax] Error:', err);
      res.status(502).json({ success: false, error: 'Gagal mengambil data pajak market' });
    }
  });

  // 2.5 Gevechten — agregasi bonus/order dari komunitas warera.realmarijn.nl
  app.get('/api/gevechten/battles', async (_req, res) => {
    try {
      const upstream = await fetch('https://warera.realmarijn.nl/api/gevechten/battles');
      if (!upstream.ok) {
        return res.status(502).json({ error: `Komunitas gevechten gagal (${upstream.status})` });
      }
      res.status(200).json(await upstream.json());
    } catch (err: any) {
      console.error('[Gevechten] Gagal ambil data dari komunitas:', err);
      res.status(502).json({ error: 'Gagal ambil data gevechten' });
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

      const userCache = await fetchUserLiteThrottled(userIds);

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

      const userIds = Array.from(
        new Set(
          rawTransactions
            .flatMap((tx: any) => [tx?.buyerId, tx?.sellerId])
            .filter(Boolean)
        )
      ) as string[];

      const userCache = await fetchUserLiteThrottled(userIds);

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

  // 7a. Realmarijn series — fallback candle untuk item yang belum punya history di Pulse
  app.get('/api/markt/series/:item', async (req, res) => {
    const { item } = req.params;
    const days = req.query.days || 7;
    try {
      const response = await fetch(
        `https://warera.realmarijn.nl/api/markt/items/${encodeURIComponent(item)}/series.json?days=${encodeURIComponent(String(days))}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EraPlanner/1.0)' } }
      );
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: 'Failed to fetch series data',
        });
      }
      const data = await response.json();
      res.set('Cache-Control', 'public, max-age=60');
      res.json(data);
    } catch (err: any) {
      console.error('[Realmarijn Series Error]', err);
      res.status(502).json({ success: false, error: 'Realmarijn series unavailable' });
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

      const userCache = await fetchUserLiteThrottled(userIds);

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