export const onRequestGet: PagesFunction = async () => {
  const procedure = "itemTrading.getPrices";
  try {
    const targetUrl = `https://api2.warera.io/trpc/${procedure}`;
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const json = await response.json();
    return Response.json(json, { status: response.status });
  } catch (err: any) {
    console.error("[Proxy Error] Failed to fetch market items:", err);
    return Response.json(
      { error: "Gagal mengambil data market", detail: err.message },
      { status: 502 }
    );
  }
};
