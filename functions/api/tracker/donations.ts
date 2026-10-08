// functions/api/tracker/donations.ts
// Cloudflare Pages Function: donasi mingguan per negara (Senin 00:00 UTC).
//
// Sumber EVENT (bukan saldo agregat): transaction.getPaginatedTransactions
// dengan transactionType='donation' — tiap baris = 1 pemberian (money,
// createdAt, buyerId = donatur). Seminggu ≈ 5 halaman (454 event untuk
// Indonesia, total 20.803 = cocok dengan laporan kas game). Jadi mingguan
// dihitung LANGSUNG per request (CF cache 5 menit), tanpa snapshot-diff.
//
// (donation.getManyPaginated hanya memberi saldo kumulatif per user —
// dipakai untuk daftar donatur + nama, bukan untuk angka mingguan.)
import { callCommunity } from '../_shared/community';
import { currentMonday, weekRangeUTC, isValidWeekStart, mondayOf } from '../_shared/week';

const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

const DEFAULT_COUNTRY_ID = '6813b6d546e731854c7ac829'; // Indonesia
const MAX_PAGES = 80; // ≈ 3 bulan ke belakang (5 halaman/minggu)
const AGG_TTL_SECONDS = 300; // L1 5 menit
const USER_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 jam
const MAX_NEW_RESOLUTIONS = 30;
const CONCURRENCY = 6;

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };
}

function userCacheUrl(uid: string): URL {
  const safe = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  return new URL(`https://cache.internal/__tracker_user_cache/${safe}`);
}

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, { status: 204, headers: getCorsHeaders(request) });

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const waitUntil = (context as any)?.waitUntil;
  const headers = getCorsHeaders(request);
  const url = new URL(request.url);
  const countryId = url.searchParams.get('countryId') || DEFAULT_COUNTRY_ID;
  const weekParam = url.searchParams.get('weekStart') || '';
  const weekStart = weekParam && isValidWeekStart(weekParam) ? weekParam : currentMonday();
  const forceRefresh = url.searchParams.has('_');

  try {
    const cache = caches.default;
    const base = new URL(request.url);
    base.search = '';
    const slug = `donev:${countryId}:${weekStart}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
    const aggKey = new URL(base);
    aggKey.pathname = `/__tracker_donev_agg/${slug}`;
    if (!forceRefresh) {
      try {
        const hit = await cache.match(aggKey);
        if (hit) return Response.json(await hit.json(), { headers: { 'Content-Type': 'application/json', ...headers } });
      } catch {
        // miss
      }
    }

    const { start: weekStartDate, end: weekEndDate } = weekRangeUTC(weekStart);
    const monthStart = new Date(Date.UTC(weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth(), 1));
    const stopAt = Math.min(weekStartDate.getTime(), monthStart.getTime());

    // Tarik event donasi terbaru->terlama, berhenti di awal minggu/bulan.
    const events: { money: number; time: number; donorId: string }[] = [];
    let cursor: string | null = null;
    let pagesUsed = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const input: Record<string, any> = { countryId, transactionType: 'donation', limit: 100 };
      if (cursor) input.cursor = cursor;
      let json: any = null;
      try {
        json = await callCommunity('transaction.getPaginatedTransactions', input, 8000);
      } catch {
        json = null;
      }
      if (!json) break; // gagal fetch — kembalikan data parsial apa adanya
      const data = json?.result?.data;
      const items = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) break;
      pagesUsed++;
      let reachedStop = false;
      for (const tx of items) {
        const t = new Date(tx?.createdAt || 0).getTime();
        if (!Number.isFinite(t)) continue;
        if (t < stopAt) {
          reachedStop = true;
          break;
        }
        const money = Number(tx?.money) || 0;
        if (money <= 0) continue;
        events.push({ money, time: t, donorId: String(tx?.buyerId || tx?.sellerId || '') });
      }
      if (reachedStop) break;
      cursor = data?.nextCursor || null;
      if (!cursor) break;
    }

    // Agregasi: minggu terpilih (7 bar harian) + bulan berjalan.
    const daily: { date: string; total: number; count: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate.getTime() + i * 86400000).toISOString().slice(0, 10);
      daily.push({ date: d, total: 0, count: 0 });
    }
    let weekTotal = 0;
    let weekCount = 0;
    let monthTotal = 0;
    let monthCount = 0;
    const donorMap = new Map<string, { total: number; count: number; lastAt: number }>();
    for (const e of events) {
      const inWeek = e.time >= weekStartDate.getTime() && e.time < weekEndDate.getTime();
      const d = new Date(e.time);
      const inMonth =
        d.getUTCFullYear() === weekStartDate.getUTCFullYear() &&
        d.getUTCMonth() === weekStartDate.getUTCMonth();
      if (inMonth) {
        monthTotal += e.money;
        monthCount++;
      }
      if (!inWeek) continue;
      weekTotal += e.money;
      weekCount++;
      const idx = Math.floor((e.time - weekStartDate.getTime()) / 86400000);
      if (idx >= 0 && idx < 7) {
        daily[idx].total += e.money;
        daily[idx].count++;
      }
      if (e.donorId) {
        let entry = donorMap.get(e.donorId);
        if (!entry) {
          entry = { total: 0, count: 0, lastAt: 0 };
          donorMap.set(e.donorId, entry);
        }
        entry.total += e.money;
        entry.count++;
        entry.lastAt = Math.max(entry.lastAt, e.time);
      }
    }

    // Resolve username top donatur minggu ini (budget; sisanya on-demand).
    const ranked = [...donorMap.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 50);
    const toResolve = ranked.slice(0, MAX_NEW_RESOLUTIONS).map(([uid]) => uid);
    const infos = new Map<string, { username: string; avatarUrl: string }>();
    for (const uid of toResolve) {
      try {
        const hit = await cache.match(userCacheUrl(uid));
        if (hit) {
          const j = (await hit.json()) as { username?: string; avatarUrl?: string };
          if (j?.username) infos.set(uid, { username: j.username, avatarUrl: j.avatarUrl || '' });
        }
      } catch {
        // miss
      }
    }
    const missing = toResolve.filter((uid) => {
      const e = infos.get(uid);
      return !e?.username || !e.avatarUrl;
    });
    let idx = 0;
    async function worker() {
      while (idx < missing.length) {
        const uid = missing[idx++];
        try {
          const json = await callCommunity('user.getUserLite', { userId: uid }, 5000);
          const user = json?.result?.data;
          const name = user?.username;
          if (name) {
            const entry = { username: name, avatarUrl: user?.avatarUrl || '' };
            infos.set(uid, entry);
            const p = cache.put(
              userCacheUrl(uid),
              new Response(JSON.stringify(entry), {
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': `public, max-age=${USER_CACHE_TTL_SECONDS}`,
                },
              }),
            );
            if (waitUntil) waitUntil(p);
            else await p;
          }
        } catch {
          // fallback di render
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));

    const nowIso = new Date().toISOString();
    const payload = {
      success: true,
      data: {
        countryId,
        weekStart,
        fetchedAt: nowIso,
        pagesUsed,
        week: {
          total: weekTotal,
          count: weekCount,
          donors: donorMap.size,
          daily,
        },
        month: {
          month: `${weekStartDate.getUTCFullYear()}-${String(weekStartDate.getUTCMonth() + 1).padStart(2, '0')}`,
          total: monthTotal,
          count: monthCount,
        },
        topDonors: ranked.map(([userId, e]) => ({
          userId,
          username: infos.get(userId)?.username || '',
          avatarUrl: infos.get(userId)?.avatarUrl || '',
          total: e.total,
          count: e.count,
          lastAt: new Date(e.lastAt).toISOString(),
        })),
        recent: events
          .filter((e) => e.time >= weekStartDate.getTime() && e.time < weekEndDate.getTime())
          .sort((a, b) => b.time - a.time)
          .slice(0, 30)
          .map((e) => ({
            donorId: e.donorId,
            donorName: infos.get(e.donorId)?.username || '',
            donorAvatar: infos.get(e.donorId)?.avatarUrl || '',
            money: e.money,
            at: new Date(e.time).toISOString(),
          })),
        // Arsip: 8 minggu ke belakang (label saja; angka dihitung on-demand
        // saat minggu tsb dipilih — paginasi mundur dari terbaru).
        archiveHint: { thisWeek: currentMonday(), weeksBack: 8 },
        _note: `minggu ${mondayOf(weekStartDate.toISOString())}`,
      },
    };

    try {
      const p = cache.put(
        aggKey,
        new Response(JSON.stringify(payload), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${AGG_TTL_SECONDS}` },
        }),
      );
      if (waitUntil) waitUntil(p);
      else await p;
    } catch {
      // abaikan
    }
    return Response.json(payload, { headers: { 'Content-Type': 'application/json', ...headers } });
  } catch (err: any) {
    console.error('[CF Tracker Donations Error]', err);
    return Response.json({ success: false, error: 'Gagal mengambil data donasi' }, { status: 502, headers });
  }
};
