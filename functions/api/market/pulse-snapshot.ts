export const onRequestGet: PagesFunction = async () => {
  try {
    const response = await fetch("https://www.warera-pulse.info/api/snapshot", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EraPlanner/1.0)" },
    });

    if (!response.ok) {
      return Response.json(
        { success: false, error: "Gagal mengambil snapshot market", status: response.status },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(
      { success: true, data },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  } catch (err: any) {
    console.error("[Pulse Proxy Error] Failed to fetch snapshot:", err);
    return Response.json(
      { success: false, error: "Gagal terhubung ke WarEra Pulse", detail: err.message },
      { status: 502 }
    );
  }
};
