// Gateway ke warera-pulse.info (bukan API resmi WarEra, tapi sumber data
// candle OHLC pihak ketiga). Proxy sederhana, tinggal forward tf & itemCode.

export const onRequestGet: PagesFunction = async (context) => {
  const { params, request } = context;
  const item = params.item as string;
  const url = new URL(request.url);
  const tf = url.searchParams.get("tf") || "week";

  try {
    const targetUrl = `https://www.warera-pulse.info/api/history/${item}?tf=${encodeURIComponent(tf)}`;
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EraPlanner/1.0)" },
    });

    if (!response.ok) {
      return Response.json(
        { error: "Gagal mengambil data candle dari WarEra Pulse", status: response.status },
        { status: response.status }
      );
    }

    const json = await response.json();
    // Cache ringan di edge selama 60 detik, biar gak nembak warera-pulse.info
    // berkali-kali kalau banyak user buka chart yang sama nyaris bersamaan.
    return Response.json(json, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (err: any) {
    console.error("[Pulse Proxy Error]", err);
    return Response.json(
      { error: "Gagal terhubung ke WarEra Pulse", detail: err.message },
      { status: 502 }
    );
  }
};
