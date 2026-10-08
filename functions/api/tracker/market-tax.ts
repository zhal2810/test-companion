// functions/api/tracker/market-tax.ts
// Cloudflare Pages Function: pajak market equipment per minggu.
//
// Mekanisme (terverifikasi): penjualan equipment market (transactionType
// 'itemMarket') oleh seller citizen negara tsb kena pajak market
// (taxes.market, Indonesia = 1%) yang masuk kas negara.
// Tx itemMarket TIDAK membawa info negara -> seller difilter via himpunan
// citizen dari spywarera (1 request, cache Supabase 24 jam), BUKAN resolve
// per-seller.
//
// Chunked ingest: 1 request memproses N halaman dari cursor (CF Free limit
// 50 subrequest). Frontend mem-poll dengan nextCursor sampai done. Supabase
// adalah cache persisten: market_tx (dedupe tx_id), weekly_tax (agregat).
import { callCommunity } from '../_shared/community';
import { getSupabaseCreds, sbSelect, sbUpsert, sbUpsertNew } from '../_shared/supabase';
import { currentMonday, weekRangeUTC, isValidWeekStart } from '../_shared/week';

const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

const DEFAULT_COUNTRY_ID = '6813b6d546e731854c7ac829'; // Indonesia
const CITIZEN_TTL_MS = 24 * 60 * 60 * 1000; // refresh citizen 1x sehari
const RATE_TTL_SECONDS = 3600; // cache rate pajak 1 jam
const SPYWARERA_VERSION = '6a7d711f474908a8ccf2e6a0923e8865';
const DEFAULT_PAGES = 25;
const MAX_PAGES = 40;
const USER_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 jam
const AVATAR_BUDGET = 30;
const AVATAR_CONCURRENCY = 6;

function userCacheUrl(uid: string): URL {
  const safe = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  return new URL(`https://cache.internal/__tracker_user_cache/${safe}`);
}

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, { status: 204, headers: getCorsHeaders(request) });

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const waitUntil = (context as any)?.waitUntil;
  const env = (context as any)?.env || {};
  const headers = getCorsHeaders(request);
  const url = new URL(request.url);
  const countryId = url.searchParams.get('countryId') || DEFAULT_COUNTRY_ID;
  const weekParam = url.searchParams.get('weekStart') || '';
  const weekStart = weekParam && isValidWeekStart(weekParam) ? weekParam : currentMonday();
  const startCursor = url.searchParams.get('cursor') || null;
  const pages = Math.max(
    1,
    Math.min(MAX_PAGES, Number(url.searchParams.get('pages')) || DEFAULT_PAGES),
  );

  const creds = getSupabaseCreds(env);
  if (!creds) {
    return Response.json(
      { success: false, error: 'Supabase belum dikonfigurasi (SUPABASE_URL / SUPABASE_SERVICE_KEY)' },
      { status: 500, headers },
    );
  }

  try {
    const cache = caches.default;
    const nowIso = new Date().toISOString();
    const { start: weekStartDate, end: weekEndDate } = weekRangeUTC(weekStart);

    // 1) Himpunan citizen (Supabase; refresh dari spywarera bila basi).
    let citizenRows: any[] = await sbSelect(
      creds,
      'country_citizens',
      `country_id=eq.${countryId}&select=user_id,username,fetched_at`,
    ).catch(() => []);
    const newestFetch = citizenRows.reduce(
      (m: number, r: any) => Math.max(m, new Date(r.fetched_at || 0).getTime()),
      0,
    );
    let citizenStale = false;
    if (citizenRows.length === 0 || Date.now() - newestFetch > CITIZEN_TTL_MS) {
      try {
        const spy = await fetch('https://spywarera.com/countries/indonesia', {
          headers: {
            'X-Inertia': 'true',
            'X-Inertia-Version': SPYWARERA_VERSION,
            'X-Inertia-Partial-Data': 'citizens',
            'X-Inertia-Partial-Component': 'Countries/Show',
            Accept: 'application/json',
          },
        });
        if (!spy.ok) throw new Error(`spywarera ${spy.status}`);
        const sj: any = await spy.json();
        const list = Array.isArray(sj?.props?.citizens) ? sj.props.citizens : [];
        if (list.length > 0) {
          const upserts = list
            .filter((c: any) => c?.player_warera_id)
            .map((c: any) => ({
              country_id: countryId,
              user_id: String(c.player_warera_id),
              username: c.username || c.display_name || '',
              fetched_at: nowIso,
            }));
          await sbUpsert(creds, 'country_citizens', upserts, 'country_id,user_id').catch(() => null);
          citizenRows = await sbSelect(
            creds,
            'country_citizens',
            `country_id=eq.${countryId}&select=user_id,username,fetched_at`,
          ).catch(() => citizenRows);
        } else {
          citizenStale = citizenRows.length > 0;
        }
      } catch {
        // spywarera gagal: lanjut dengan set lama bila ada.
        if (citizenRows.length === 0) {
          return Response.json(
            { success: false, error: 'Gagal memuat daftar citizen (spywarera tidak dapat dihubungi)' },
            { status: 502, headers },
          );
        }
        citizenStale = true;
      }
    }
    const citizenNames = new Map<string, string>();
    for (const r of citizenRows) citizenNames.set(String(r.user_id), String(r.username || ''));

    // 2) Rate pajak market negara tsb (default 1).
    let rate = 1;
    try {
      const rateKey = new URL(`https://cache.internal/__tracker_taxrate/${countryId}`);
      const cachedRate = await cache.match(rateKey).then((r) => r?.json()).catch(() => null);
      if (cachedRate && typeof (cachedRate as any).rate === 'number') {
        rate = (cachedRate as any).rate;
      } else {
        const cj = await callCommunity('country.getCountryById', { countryId }, 6000);
        const t = toNumber(cj?.result?.data?.taxes?.market);
        if (t > 0) rate = t;
        const p = cache.put(
          rateKey,
          new Response(JSON.stringify({ rate }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${RATE_TTL_SECONDS}` },
          }),
        );
        if (waitUntil) waitUntil(p);
        else await p;
      }
    } catch {
      // tetap rate default
    }

    // 3) Paginasi chunk itemMarket terbaru->terlama, berhenti di weekStart.
    const matched: Record<string, any>[] = [];
    let cursor: string | null = startCursor;
    let done = false;
    let scanned = 0;
    let oldestSeen: string | null = null;
    for (let page = 0; page < pages; page++) {
      const input: Record<string, any> = { transactionType: 'itemMarket', limit: 100 };
      if (cursor) input.cursor = cursor;
      let json: any = null;
      try {
        json = await callCommunity('transaction.getPaginatedTransactions', input, 8000);
      } catch {
        json = null;
      }
      if (!json) {
        // Gagal fetch (timeout) — JANGAN tandai done, biarkan poll berikutnya
        // lanjut dari cursor terakhir yang valid.
        try {
          await new Promise((r) => setTimeout(r, 500));
          json = await callCommunity('transaction.getPaginatedTransactions', input, 8000);
        } catch {
          json = null;
        }
        if (!json) break;
      }
      const data = json?.result?.data;
      const items = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) {
        const next = data?.nextCursor || null;
        if (!next) {
          done = true;
          break;
        }
        cursor = next; // halaman kosong sesaat — lanjut, bukan selesai
        continue;
      }
      for (const tx of items) {
        const created = String(tx?.createdAt || '');
        const t = new Date(created).getTime();
        if (!Number.isFinite(t)) continue;
        oldestSeen = created;
        if (t < weekStartDate.getTime()) {
          done = true;
          break;
        }
        scanned++;
        const sid = String(tx?.sellerId || '');
        if (!sid || !citizenNames.has(sid)) continue;
        const money = toNumber(tx?.money);
        if (money <= 0) continue;
        const soldAt = new Date(t).toISOString();
        matched.push({
          tx_id: String(tx?._id || ''),
          country_id: countryId,
          item_code: String(tx?.itemCode || ''),
          money,
          tax: money * (rate / 100),
          seller_id: sid,
          seller_name: citizenNames.get(sid) || '',
          buyer_id: String(tx?.buyerId || ''),
          sold_at: soldAt,
          week_start: soldAt.slice(0, 10) >= weekStart ? weekStart : soldAt.slice(0, 10),
          inserted_at: nowIso,
        });
      }
      if (done) break;
      cursor = data?.nextCursor || null;
      if (!cursor) {
        done = true;
        break;
      }
    }
    // week_start per baris: bucket Senin-nya masing-masing (chunk bisa
    // melewati beberapa minggu saat backfill).
    for (const m of matched) {
      const d = new Date(m.sold_at);
      const day = d.getUTCDay();
      const diff = (day + 6) % 7;
      m.week_start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
        .toISOString()
        .slice(0, 10);
    }

    // 4) Simpan yang benar-benar baru (dedupe tx_id) per minggu.
    const inserted = await sbUpsertNew(creds, 'market_tx', matched, 'tx_id').catch(() => []);
    const byWeek = new Map<string, { volume: number; tax: number; sellers: Set<string>; count: number }>();
    for (const row of inserted || []) {
      const w = String((row as any).week_start);
      let b = byWeek.get(w);
      if (!b) {
        b = { volume: 0, tax: 0, sellers: new Set(), count: 0 };
        byWeek.set(w, b);
      }
      b.volume += toNumber((row as any).money);
      b.tax += toNumber((row as any).tax);
      b.sellers.add(String((row as any).seller_id));
      b.count++;
    }
    for (const [w, b] of byWeek) {
      try {
        const existing: any[] = await sbSelect(
          creds,
          'weekly_tax',
          `country_id=eq.${countryId}&week_start=eq.${w}&select=total_tax,total_volume,tx_count,seller_count`,
        );
        const cur = existing[0] || { total_tax: 0, total_volume: 0, tx_count: 0, seller_count: 0 };
        const sellerRows: any[] = await sbSelect(
          creds,
          'market_tx',
          `country_id=eq.${countryId}&week_start=eq.${w}&select=seller_id&limit=2000`,
        ).catch(() => []);
        await sbUpsert(
          creds,
          'weekly_tax',
          [
            {
              country_id: countryId,
              week_start: w,
              total_tax: toNumber(cur.total_tax) + b.tax,
              total_volume: toNumber(cur.total_volume) + b.volume,
              tx_count: toNumber(cur.tx_count) + b.count,
              seller_count: new Set(sellerRows.map((r: any) => String(r.seller_id))).size,
              rate,
              updated_at: nowIso,
            },
          ],
          'country_id,week_start',
        );
      } catch {
        // lanjut minggu lain
      }
    }

    // 5) Baca agregat + top seller + terbaru untuk minggu yang diminta.
    const aggRows: any[] = await sbSelect(
      creds,
      'weekly_tax',
      `country_id=eq.${countryId}&week_start=eq.${weekStart}&select=total_tax,total_volume,tx_count,seller_count,rate,updated_at`,
    ).catch(() => []);
    const agg = aggRows[0] || {
      total_tax: 0,
      total_volume: 0,
      tx_count: 0,
      seller_count: 0,
      rate,
      updated_at: null,
    };
    // weekRows: seluruh minggu untuk top seller (bukan cuma 300 terbaru —
    // minggu sibuk >300 tx akan memotong top seller). Recent = 30 teratas.
    const weekRows: any[] = await sbSelect(
      creds,
      'market_tx',
      `country_id=eq.${countryId}&week_start=eq.${weekStart}&select=tx_id,item_code,money,tax,seller_id,seller_name,sold_at&order=sold_at.desc&limit=5000`,
    ).catch(() => []);

    const sellerMap = new Map<string, { name: string; tx: number; volume: number; tax: number }>();
    for (const r of weekRows) {
      const sid = String(r.seller_id);
      let e = sellerMap.get(sid);
      if (!e) {
        e = { name: String(r.seller_name || sid.slice(0, 8)), tx: 0, volume: 0, tax: 0 };
        sellerMap.set(sid, e);
      }
      e.tx++;
      e.volume += toNumber(r.money);
      e.tax += toNumber(r.tax);
    }

    // Avatar seller (top by pajak + yang muncul di recent).
    const rankedIds = [...sellerMap.entries()]
      .sort((a, b) => b[1].tax - a[1].tax)
      .map(([sid]) => sid);
    const recentIds = weekRows.slice(0, 30).map((r: any) => String(r.seller_id));
    const avatarTargets = [...new Set([...rankedIds, ...recentIds])].slice(0, AVATAR_BUDGET);
    const avatars = new Map<string, string>();
    for (const uid of avatarTargets) {
      try {
        const hit = await cache.match(userCacheUrl(uid));
        if (hit) {
          const j = (await hit.json()) as { avatarUrl?: string };
          if (j?.avatarUrl) avatars.set(uid, j.avatarUrl);
        }
      } catch {
        // miss
      }
    }
    const avatarMissing = avatarTargets.filter((uid) => !avatars.has(uid));
    let aIdx = 0;
    async function avatarWorker() {
      while (aIdx < avatarMissing.length) {
        const uid = avatarMissing[aIdx++];
        try {
          const json = await callCommunity('user.getUserLite', { userId: uid }, 5000);
          const user = json?.result?.data;
          // Simpan gabungan username+avatar agar cache dipakai kedua endpoint.
          const entry = { username: user?.username || '', avatarUrl: user?.avatarUrl || '' };
          if (entry.avatarUrl || entry.username) {
            if (entry.avatarUrl) avatars.set(uid, entry.avatarUrl);
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
          // fallback inisial di render
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(AVATAR_CONCURRENCY, avatarMissing.length) }, avatarWorker));

    const topSellers = [...sellerMap.entries()]
      .map(([sellerId, e]) => ({ sellerId, ...e, avatarUrl: avatars.get(sellerId) || '' }))
      .sort((a, b) => b.tax - a.tax)
      .slice(0, 15);

    const weeks: any[] = await sbSelect(
      creds,
      'weekly_tax',
      `country_id=eq.${countryId}&select=week_start,total_tax,tx_count&order=week_start.desc&limit=26`,
    ).catch(() => []);

    return Response.json(
      {
        success: true,
        data: {
          countryId,
          weekStart,
          weekEnd: weekEndDate.toISOString().slice(0, 10),
          rate,
          citizenCount: citizenNames.size,
          citizenStale,
          aggregate: {
            totalTax: toNumber(agg.total_tax),
            totalVolume: toNumber(agg.total_volume),
            txCount: toNumber(agg.tx_count),
            sellerCount: toNumber(agg.seller_count),
            updatedAt: (agg as any).updated_at || null,
          },
          topSellers,
          recent: weekRows.slice(0, 30).map((r: any) => ({
            txId: r.tx_id,
            itemCode: r.item_code,
            money: toNumber(r.money),
            tax: toNumber(r.tax),
            sellerId: r.seller_id,
            sellerName: r.seller_name,
            sellerAvatar: avatars.get(String(r.seller_id)) || '',
            soldAt: r.sold_at,
          })),
          ingest: {
            done,
            nextCursor: done ? null : cursor,
            scanned,
            newRows: (inserted || []).length,
            oldestSeen,
          },
          weeks: weeks.map((w: any) => ({
            weekStart: w.week_start,
            totalTax: toNumber(w.total_tax),
            txCount: toNumber(w.tx_count),
          })),
          fetchedAt: nowIso,
        },
      },
      { headers: { 'Content-Type': 'application/json', ...headers } },
    );
  } catch (err: any) {
    console.error('[CF Tracker MarketTax Error]', err);
    return Response.json({ success: false, error: 'Gagal mengambil data pajak market' }, { status: 502, headers });
  }
};
