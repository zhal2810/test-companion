// Catatan: server.ts versi Express baca file ini pakai fs.readFileSync,
// tapi Cloudflare Pages Functions jalan di edge runtime TANPA filesystem.
// Solusinya: import langsung sebagai JSON module, dibundle saat build.
import stats from "../../../temp_warera_stats.json";

export const onRequestGet: PagesFunction = async () => {
  try {
    return Response.json({ success: true, data: stats });
  } catch (err: any) {
    return Response.json(
      { success: false, error: "Gagal membaca statistik pasar", detail: err.message },
      { status: 500 }
    );
  }
};
