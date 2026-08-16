// functions/api/tracker/oil-maintenance.ts
// Cloudflare Pages Function: ringkasan konsumsi Oil (Bunker + Pacification Center)
// per region dari sebuah negara.
//
// Rumus (terverifikasi terhadap nilai live di UI game):
//   Bunker oil/h = max(minMaintenance(level), maintenanceCostCountryDevScale(level) × country.averageDevelopment)
//   PC     oil/h = max(minMaintenance(level), maintenanceCostRegionDevScale(level) × region.development)
//   g/h         = oil/h × harga Oil pasar (itemTrading.getPrices)
// Hanya upgrade dengan status "active" yang mengonsumsi oil.
//
// Sumber: region.getAll (nama/dev region), country.getCountryById (avgDevelopment),
// itemTrading.getPrices (harga oil), upgrade.getUpgradeByTypeAndEntity (level+status).
import { callCommunity } from '../_shared/community';

const ALLOWED_ORIGINS = [
  'https://test-companion.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

const DEFAULT_COUNTRY_ID = '6813b6d546e731854c7ac829'; // Indonesia
const AGG_TTL_SECONDS = 120; // cache agregat 2 menit (status upgrade & harga oil cepat berubah)
const CONCURRENCY = 6;

// Skala maintenance dari gameConfig.upgradesConfig (per level).
const BUNKER_SCALE: Record<number, number> = { 1: 0.04, 2: 0.08, 3: 0.16, 4: 0.32, 5: 0.64 };
const BUNKER_MIN: Record<number, number> = { 1: 1, 2: 2, 3: 5, 4: 10, 5: 25 };
const PC_SCALE: Record<number, number> = { 1: 0.05, 2: 0.1, 3: 0.2, 4: 0.4, 5: 0.8 };
const PC_MIN: Record<number, number> = { 1: 1, 2: 2, 3: 5, 4: 10, 5: 25 };

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function cacheGetJSON(cache: Cache, key: URL): Promise<any | null> {
  try {
    const res = await cache.match(key);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function cachePutJSON(cache: Cache, key: URL, value: any, maxAgeSeconds: number, waitUntil?: any): void {
  const res = new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAgeSeconds}` },
  });
  try {
    const p = cache.put(key, res);
    if (waitUntil) waitUntil(p);
  } catch {
    // Cache tidak tersedia — abaikan.
  }
}

// Ambil upgrade per region dengan retry terbatas. Mengembalikan null kalau
// record upgrade tidak ada (region belum pernah membangun upgrade tsb).
async function fetchUpgrade(
  upgradeType: string,
  regionId: string,
  attempts = 3,
): Promise<any | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const json = await callCommunity('upgrade.getUpgradeByTypeAndEntity', {
        upgradeType,
        regionId,
      });
      if (json?.result?.data) return json.result.data;
    } catch {
      // retry
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, { status: 204, headers: getCorsHeaders(request) });

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const waitUntil = (context as any)?.waitUntil;
  const headers = getCorsHeaders(request);
  const url = new URL(request.url);
  const countryId = url.searchParams.get('countryId') || DEFAULT_COUNTRY_ID;

  try {
    const cache = caches.default;
    const base = new URL(request.url);
    base.search = '';
    const slug = `oil-maintenance:${countryId}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
    const aggKey = new URL(base);
    aggKey.pathname = `/__oil_maintenance_agg/${slug}`;

    const forceRefresh = url.searchParams.has('_');
    if (!forceRefresh) {
      const aggHit = await cacheGetJSON(cache, aggKey);
      if (aggHit) {
        return Response.json(aggHit, {
          headers: { 'Content-Type': 'application/json', ...headers },
        });
      }
    }

    // 1) Semua region (untuk nama + development region milik negara).
    const regionJson = await callCommunity('region.getAll', {});
    const regionsAll: any[] = Array.isArray(regionJson?.result?.data)
      ? regionJson.result.data
      : [];
    const countryRegions = regionsAll.filter((r) => r?.country === countryId);

    // 2) Development rata-rata negara (untuk skala bunker).
    const countryJson = await callCommunity('country.getCountryById', { countryId });
    const averageDevelopment = toNumber(countryJson?.result?.data?.averageDevelopment);

    // 3) Harga Oil pasar (untuk konversi g/h).
    const pricesJson = await callCommunity('itemTrading.getPrices', {});
    const prices: Record<string, any> = pricesJson?.result?.data ?? {};
    const oilPrice =
      toNumber(prices?.oil) ||
      toNumber(prices?.Oil) ||
      toNumber((prices as any)?.oil?.price) ||
      0;

    // 4) Level + status upgrade per region (bunker + pacificationCenter).
    //    Subrequest budget: 2 upgrade/region + 3 call dasar. Kalau negara punya
    //    region lebih dari budget, region sisanya diturunkan dari
    //    region.activeUpgradeLevels (hanya level, status dianggap aktif kalau
    //    ada di situ, kalau tidak berarti off level 0).
    const subrequestLimit = Number((context as any)?.env?.SUBREQUEST_LIMIT) || 50;
    const upgradeBudget = Math.max(0, subrequestLimit - 5); // 3 dasar + bantalan
    const regionBudget = Math.floor(upgradeBudget / 2);

    const upgradeMap = new Map<string, any>();
    const idx = { i: 0 };
    const overBudget: string[] = [];

    async function worker() {
      while (idx.i < countryRegions.length) {
        const region = countryRegions[idx.i++];
        if (idx.i <= regionBudget) {
          const [bunker, pc] = await Promise.all([
            fetchUpgrade('bunker', region._id),
            fetchUpgrade('pacificationCenter', region._id),
          ]);
          upgradeMap.set(region._id, { bunker, pc });
        } else {
          overBudget.push(region._id);
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, regionBudget) }, worker),
    );

    // Untuk region di luar budget: fallback dari activeUpgradeLevels.
    const regions = countryRegions.map((r: any) => {
      const activeLevels: Record<string, number> = r?.activeUpgradeLevels ?? {};
      let bunkerLevel = 0;
      let bunkerStatus = 'off';
      let pcLevel = 0;
      let pcStatus = 'off';

      if (overBudget.includes(r._id)) {
        bunkerLevel = toNumber(activeLevels.bunker);
        pcLevel = toNumber(activeLevels.pacificationCenter);
        bunkerStatus = bunkerLevel > 0 ? 'active' : 'off';
        pcStatus = pcLevel > 0 ? 'active' : 'off';
      } else {
        const u = upgradeMap.get(r._id);
        if (u?.bunker) {
          bunkerLevel = toNumber(u.bunker.level);
          bunkerStatus = u.bunker.status === 'active' ? 'active' : u.bunker.status === 'pending' ? 'activating' : 'off';
        }
        if (u?.pc) {
          pcLevel = toNumber(u.pc.level);
          pcStatus = u.pc.status === 'active' ? 'active' : u.pc.status === 'pending' ? 'activating' : 'off';
        }
      }

      // Konsumsi oil hanya untuk upgrade dengan status "active".
      const bunkerOil =
        bunkerStatus === 'active' && bunkerLevel > 0
          ? Math.max(BUNKER_MIN[bunkerLevel] ?? 0, (BUNKER_SCALE[bunkerLevel] ?? 0) * averageDevelopment)
          : 0;
      const pcOil =
        pcStatus === 'active' && pcLevel > 0
          ? Math.max(PC_MIN[pcLevel] ?? 0, (PC_SCALE[pcLevel] ?? 0) * toNumber(r.development))
          : 0;
      const oilPerHour = bunkerOil + pcOil;

      return {
        regionId: r._id,
        code: r.code || '',
        name: r.name || r.code || '',
        development: toNumber(r.development),
        bunkerLevel,
        bunkerStatus,
        pacificationCenterLevel: pcLevel,
        pacificationCenterStatus: pcStatus,
        oilPerHour: round(oilPerHour, 1),
        goldPerHour: round(oilPerHour * oilPrice, 2),
      };
    });

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
        regions: regions.sort((a, b) => {
          const rank = (s: string) => (s === 'active' ? 0 : s === 'activating' ? 1 : 2);
          return rank(a.bunkerStatus) - rank(b.bunkerStatus) || a.name.localeCompare(b.name);
        }),
        counts,
        totalOilPerHour: round(totalOilPerHour, 1),
        totalGoldPerHour: round(totalGoldPerHour, 2),
      },
    };

    cachePutJSON(cache, aggKey, payload, AGG_TTL_SECONDS, waitUntil);

    return Response.json(payload, {
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  } catch (err: any) {
    console.error('[CF Oil Maintenance Error]', err);
    return Response.json(
      { success: false, error: 'Gagal mengambil data maintenance oil' },
      { status: 502, headers },
    );
  }
};

function round(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}
