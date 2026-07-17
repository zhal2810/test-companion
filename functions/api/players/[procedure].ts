// Cloudflare Pages Function — pengganti app.all("/api/players/:procedure", ...)
// Route file [procedure].ts otomatis menangkap segmen dinamis di URL.

export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context;
  const procedure = params.procedure as string;
  const url = new URL(request.url);

  console.log(`[Proxy players] ${request.method} procedure: ${procedure}`);

  // Ambil input dari query (GET) atau body (POST)
  let rawInput: Record<string, any> = {};
  if (request.method === "GET") {
    rawInput = Object.fromEntries(url.searchParams.entries());
  } else {
    try {
      const body = await request.json().catch(() => ({}));
      rawInput = (body as any)?.input ?? body ?? {};
    } catch {
      rawInput = {};
    }
  }

  const input: Record<string, any> = { ...rawInput };

  // Konversi string numerik jadi number asli (dibutuhkan validasi Zod di WarEra)
  for (const key in input) {
    if (typeof input[key] === "string" && input[key].trim() !== "") {
      const num = Number(input[key]);
      if (!Number.isNaN(num)) input[key] = num;
    }
  }

  const apiKey = request.headers.get("x-api-key");

  try {
    const targetUrl = `https://api2.warera.io/trpc/${procedure}`;
    console.log(`[Proxy players] Forwarding to ${targetUrl} with input:`, JSON.stringify(input));

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;

    // Endpoint tRPC WarEra selalu diteruskan sebagai POST
    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });

    const json = await response.json();
    return Response.json(json, { status: response.status });
  } catch (err: any) {
    console.error(`[Proxy Error] Failed to fetch procedure ${procedure}:`, err);
    return Response.json(
      { error: "Gagal memanggil API WarEra", detail: err.message },
      { status: 500 }
    );
  }
};
