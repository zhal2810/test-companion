// Proxy ke api.warerastats.io — sumber data order book & harga efektif per-qty
// (effectivePrices), dipakai buat sinyal Buy/Sell/Hold. Pihak ketiga, BUKAN API
// resmi WarEra.
export const onRequestGet: PagesFunction = async (context) => {
  const item = context.params.item as string;

  if (!item) {
    return Response.json({ success: false, error: "Parameter item wajib diisi" }, { status: 400 });
  }

  try {
    const targetUrl = `https://api.warerastats.io/item/${encodeURIComponent(item)}`;
    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      return Response.json(
        { success: false, error: `api.warerastats.io merespons status ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(
      { success: true, data },
      { headers: { "Cache-Control": "public, max-age=30" } }
    );
  } catch (err: any) {
    console.error("[Proxy Error] Failed to fetch warerastats item:", err);
    return Response.json(
      { success: false, error: "Gagal mengambil data dari api.warerastats.io", detail: err.message },
      { status: 502 }
    );
  }
};