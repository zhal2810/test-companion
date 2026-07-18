// functions/api/warera/[procedure].ts
import { handleWareraProxy } from '../../../src/utils/proxyHandler';

export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context;
  const procedure = params.procedure as string;
  
  // 1. Tangani preflight request (OPTIONS) untuk CORS aman
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'https://test-companion.pages.dev', // Ganti dengan domain Anda
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      },
    });
  }

  const url = new URL(request.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());
  
  // 2. Ambil JSON body dengan aman jika metodenya bukan GET/HEAD
  let body: any = null;
  if (!['GET', 'HEAD'].includes(request.method)) {
    try { 
      body = await request.json(); 
    } catch (_) {
      body = null;
    }
  }

  // 3. Konversi format headers Cloudflare ke Object biasa
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // 4. Eksekusi logika proxy dari modul bersama
  const result = await handleWareraProxy({
    procedure,
    method: request.method,
    headers,
    body,
    queryParams
  });

  // 5. Kembalikan response lengkap dengan perlindungan CORS resmi
  return new Response(JSON.stringify(result.payload), {
    status: result.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://test-companion.pages.dev', // Ganti dengan domain Anda
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
};