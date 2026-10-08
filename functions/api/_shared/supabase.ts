// functions/api/_shared/supabase.ts
// Klien REST Supabase minimal (fetch-based — jalan di Pages Functions & Node).
// Kredensial TIDAK di-hardcode: baca dari env (CF Pages env / process.env).

export interface SbCreds {
  url: string;
  key: string;
}

export function getSupabaseCreds(env: Record<string, any> | undefined | null): SbCreds | null {
  const url = env?.SUPABASE_URL || (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : '');
  const key =
    env?.SUPABASE_SERVICE_KEY || (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_KEY : '');
  if (!url || !key) return null;
  return { url: String(url).replace(/\/$/, ''), key: String(key) };
}

async function sbFetch(
  creds: SbCreds,
  path: string,
  init: RequestInit & { parseJson?: boolean } = {},
): Promise<any> {
  const res = await fetch(`${creds.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: creds.key,
      Authorization: `Bearer ${creds.key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  if (init.parseJson === false) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function sbSelect(creds: SbCreds, table: string, query: string): Promise<any[]> {
  return sbFetch(creds, `${table}?${query}`);
}

// Upsert bulk. Mengembalikan baris yang BENAR-BENAR ter-insert
// (ignore-duplicates + return representation) — untuk agregat inkremental.
export function sbUpsertNew(
  creds: SbCreds,
  table: string,
  rows: Record<string, any>[],
  onConflict: string,
): Promise<any[]> {
  if (rows.length === 0) return Promise.resolve([]);
  return sbFetch(creds, `${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(rows),
  });
}

// Upsert penuh (insert atau update), kembalikan representasi.
export function sbUpsert(
  creds: SbCreds,
  table: string,
  rows: Record<string, any>[],
  onConflict: string,
): Promise<any[]> {
  if (rows.length === 0) return Promise.resolve([]);
  return sbFetch(creds, `${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  });
}
