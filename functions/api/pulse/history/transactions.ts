export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const limit = url.searchParams.get("limit") || "50";

  try {
    let targetUrl = "https://www.warera-pulse.info/api/transactions";
    const params = new URLSearchParams();
    if (code) params.append("code", code);
    if (limit) params.append("limit", limit);
    if (params.toString()) {
      targetUrl += `?${params.toString()}`;
    }

    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EraPlanner/1.0)" },
    });

    if (!response.ok) {
      return Response.json(
        { error: "Gagal mengambil data transaksi dari WarEra Pulse", status: response.status },
        { status: response.status }
      );
    }

    const json = await response.json();
    return Response.json(json, {
      headers: { "Cache-Control": "public, max-age=5" },
    });
  } catch (err: any) {
    console.error("[Pulse Transactions Proxy Error]", err);
    return Response.json(
      { error: "Gagal terhubung ke WarEra Pulse", detail: err.message },
      { status: 502 }
    );
  }
};
