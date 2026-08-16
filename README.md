
## Test Companion (ERA Production Planner)

Test Companion is a full-stack web application for analyzing in-game production, market intelligence, and company operations. This repository contains a Vite + React frontend and an Express-based backend used as a local API proxy.

## Fitur

- Market Intelligence: data pasar waktu-nyata, grafik harga, dan analitik perdagangan
- Company Analysis: metrik kinerja perusahaan dan pelacakan rantai pasok
- Production Management: penjadwalan produksi dan optimasi sumber daya
- Order Management: buku order dan ledger transaksi
- Charting: candlestick dan grafik harga dengan `lightweight-charts`

## Struktur Proyek

```
test-companion/
├── src/                   # Frontend React
├── functions/api/         # Endpoint API (serverless / functions)
├── public/                # Static assets
├── server.ts              # Backend/Proxy server
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Prasyarat

- Node.js 18+ (LTS direkomendasikan)
- npm atau yarn

## Instalasi

1. Pasang dependensi:

```bash
npm install
```

2. Buat file `.env` di root (opsional, untuk mengatur endpoint API):

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_GAME_API_ENDPOINT=https://api.era-game.com
```

3. Jalankan secara lokal

Terminal 1 - Backend server:

```bash
npm run dev
```

Terminal 2 - Frontend (Vite):

```bash
npm run dev:client
```

## Script (sesuai `package.json`)

- `npm run dev:client` — jalankan Vite dev server
- `npm run dev` — jalankan server backend (tsx server.ts)
- `npm run build` — build client & bundle server
- `npm run build:client` — build client saja
- `npm start` — jalankan server produksi (`node dist/server.cjs`)
- `npm run preview` — preview build client
- `npm run clean` — hapus artifact build (perintah `rm -rf` di package.json; pada Windows gunakan alternatif)
- `npm run lint` — jalankan TypeScript typecheck

Catatan: `npm run clean` menggunakan `rm -rf` yang mungkin tidak ada di PowerShell; gunakan `rimraf` atau hapus folder `dist` secara manual pada Windows.

## Build & Deployment

```bash
npm run build
npm start
```

## Konfigurasi & Lokasi Kode Penting

- Client HTTP client: [src/api/apiClient.ts](src/api/apiClient.ts)
- Proxy / handler eksternal: [src/utils/proxyHandler.ts](src/utils/proxyHandler.ts)
- Endpoint functions: `functions/api/` (lihat subfolder seperti `market`, `pulse`, `warera`)

## Daftar Endpoint (ringkasan)

- `GET /api/market/items`
- `GET /api/market/stats`
- `GET /api/market/pulse-snapshot`
- `GET /api/market/offers/[itemCode]`
- `GET /api/pulse/history/[item]`
- `GET /api/pulse/history/transactions`
- `GET /api/stats/item/[item]`
- `GET /api/warera/...` (lihat `functions/warera`)
- `GET /api/health`

## Troubleshooting

- Jika API tidak terhubung: periksa `VITE_API_BASE_URL` dan jalankan backend
- Jika build gagal: periksa versi Node.js dan jalankan `npm run lint` untuk cek TypeScript

## Lisensi

Lihat file LICENSE untuk detail lisensi.

---

Jika Anda ingin saya menambahkan bagian lain (contoh konfigurasi `.env`, screenshot, atau instruksi deploy), beri tahu dan saya akan memperbarui README lagi.
