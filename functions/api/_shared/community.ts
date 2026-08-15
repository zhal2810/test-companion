// functions/api/_shared/community.ts
// Satu-satunya sumber data tRPC WarEra: API komunitas warera.realmarijn.nl.
// Semua prosedur dipanggil lewat POST /api/proxy/{procedure} dengan body
// = objek parameter langsung (bukan dibungkus { input: ... }).
//
// Respons komunitas: { ok: true, data: { result: { data: ... } } }.
// Helper ini mengembalikan `json.data` (bentuk { result: { data } }), yang
// IDENTIK dengan respons api2/gateway dulu — sehingga seluruh kode downstream
// yang membaca json?.result?.data tetap bekerja tanpa perubahan.

const COMMUNITY_API_BASE = 'https://warera.realmarijn.nl';

export async function callCommunity(
  procedure: string,
  input: unknown,
  timeoutMs = 8000,
): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${COMMUNITY_API_BASE}/api/proxy/${procedure}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input ?? {}),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const json: any = await response.json();
    if (json?.ok && json?.data) return json.data;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
