// functions/api/market/stats.ts
import { handleLiveMarketStats } from '../../../src/utils/proxyHandler';

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'https://test-companion.pages.dev', // Ganti dengan domain Anda
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Panggil fungsi market stats live
  const result = await handleLiveMarketStats();

  return new Response(JSON.stringify(result.payload), {
    status: result.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://test-companion.pages.dev', // Ganti dengan domain Anda
    },
  });
};