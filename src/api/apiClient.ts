import axios from 'axios';
import { normalizeWareraPayload, extractCompanyReferences, normalizeCompanyDetail } from './companyData';

const api = axios.create({
  baseURL: '/api/players',
});

export const fetchWarera = async (procedure: string, input?: any, explicitToken: string | null = null): Promise<{ success: boolean; error: string | null; data: any }> => {
  const token = explicitToken ?? localStorage.getItem('warera_api_token');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['X-API-Key'] = token;
    }

    const response = await api.get(`/${procedure}`, {
      headers,
      params: input ?? {},
    });
    return { success: true, error: null, data: normalizeWareraPayload(response.data) };
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
};

export const searchPlayerCompanies = async (username: string): Promise<{ success: boolean; error?: string; playerData?: any; companies?: any[] }> => {
  try {
    const searchResult = await fetchWarera('search.searchAnything', { searchText: username });
    if (!searchResult.success) throw new Error(searchResult.error || 'Gagal mencari user');
    const userId = searchResult.data?.userIds?.[0];
    if (!userId) throw new Error('Pemain tidak ditemukan');

    const [profileRes, companiesListRes] = await Promise.all([
      fetchWarera('user.getUserById', { userId }),
      fetchWarera('company.getCompanies', { userId, perPage: 10 })
    ]);

    let detailedCompanies: any[] = [];
    if (companiesListRes.success) {
      const companyReferences = extractCompanyReferences(companiesListRes.data ?? companiesListRes);
      if (companyReferences.length > 0) {
        const details = await Promise.all(
          companyReferences.map((reference) => {
            if (typeof reference === 'string' || typeof reference === 'number') {
              return fetchWarera('company.getById', { companyId: reference });
            }
            if (reference && typeof reference === 'object') {
              return Promise.resolve({ success: true, error: null, data: normalizeCompanyDetail(reference) });
            }
            return Promise.resolve({ success: true, error: null, data: null });
          })
        );
        detailedCompanies = details.map((res) => normalizeCompanyDetail(res?.data ?? res)).filter(Boolean);
      }
    }
    return { success: true, playerData: profileRes.data, companies: detailedCompanies };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const getCompaniesByUserId = async (userId: string, token: string | null = null): Promise<{ success: boolean; error?: string; playerData?: any; companies?: any[] }> => {
  try {
    const [profileRes, companiesListRes] = await Promise.all([
      fetchWarera('user.getUserById', { userId }, token),
      fetchWarera('company.getCompanies', { userId, perPage: 10 }, token)
    ]);

    if (!profileRes.success) throw new Error(profileRes.error || 'Gagal mengambil profil');

    let detailedCompanies: any[] = [];
    if (companiesListRes.success) {
      const companyReferences = extractCompanyReferences(companiesListRes.data ?? companiesListRes);
      if (companyReferences.length > 0) {
        const details = await Promise.all(
          companyReferences.map((reference) => {
            if (typeof reference === 'string' || typeof reference === 'number') {
              return fetchWarera('company.getById', { companyId: reference }, token);
            }
            if (reference && typeof reference === 'object') {
              return Promise.resolve({ success: true, error: null, data: normalizeCompanyDetail(reference) });
            }
            return Promise.resolve({ success: true, error: null, data: null });
          })
        );
        detailedCompanies = details.map((res) => normalizeCompanyDetail(res?.data ?? res)).filter(Boolean);
      }
    }
    return { success: true, playerData: profileRes.data, companies: detailedCompanies };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const getItemOfferById = async (itemOfferId: string, token: string | null = null): Promise<{ success: boolean; error: string | null; data: any }> => {
  try {
    const result = await fetchWarera('itemOffer.getById', { itemOfferId }, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil penawaran item');
    return { success: true, error: null, data: result.data };
  } catch (err: any) {
    return { success: false, error: err.message, data: null };
  }
};

export const getGameConfig = async (token: string | null = null): Promise<{ success: boolean; error: string | null; data: any }> => {
  try {
    const result = await fetchWarera('gameConfig.getGameConfig', {}, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil konfigurasi game');
    return { success: true, error: null, data: result.data };
  } catch (err: any) {
    return { success: false, error: err.message, data: null };
  }
};

export const getProductionBonus = async (companyId: string, token: string | null = null): Promise<{ success: boolean; error: string | null; data: any }> => {
  try {
    const result = await fetchWarera('company.getProductionBonus', { companyId }, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil bonus produksi');
    return { success: true, error: null, data: result.data };
  } catch (err: any) {
    return { success: false, error: err.message, data: null };
  }
};

export const getWorkersByUserId = async (userId: string, token: string | null = null): Promise<{ success: boolean; error: string | null; data: Record<string, any[]> }> => {
  try {
    const result = await fetchWarera('worker.getWorkers', { userId, perPage: 100 }, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil pekerja');

    const groups = Array.isArray(result.data?.workersPerCompany) ? result.data.workersPerCompany : [];
    const workersByCompanyId = groups.reduce((acc: Record<string, any[]>, group: any) => {
      const companyId = group?.company?._id || group?.company?.id;
      if (companyId) acc[companyId] = Array.isArray(group.workers) ? group.workers : [];
      return acc;
    }, {});

    return { success: true, error: null, data: workersByCompanyId };
  } catch (err: any) {
    return { success: false, error: err.message, data: {} };
  }
};

export const getUserEcoSkills = async (userId: string, token: string | null = null): Promise<{ success: boolean; error: string | null; data: { energyValue: number; productionValue: number } }> => {
  try {
    const result = await fetchWarera('user.getUserById', { userId }, token);
    if (!result.success) throw new Error(result.error || 'Gagal mengambil data user');

    const skills = result.data?.skills || {};
    const energyValue = skills?.energy?.total ?? skills?.energy?.value ?? 0;
    const productionValue = skills?.production?.total ?? skills?.production?.value ?? 0;

    return { success: true, error: null, data: { energyValue, productionValue } };
  } catch (err: any) {
    return { success: false, error: err.message, data: { energyValue: 0, productionValue: 0 } };
  }
};

export const getMarketStats = async (): Promise<any> => {
  try {
    const response = await axios.get('/api/market/stats');
    return response.data;
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
};

export const getMarketSpark = async (): Promise<any> => {
  try {
    const response = await axios.get('/api/market/spark');
    return response.data;
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
};

export const getMarketPulseSnapshot = async (): Promise<any> => {
  try {
    const response = await axios.get('/api/market/pulse-snapshot');
    return response.data;
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
};

export const getMarketHistory = async (itemCode: string, tf: string = 'week'): Promise<any> => {
  try {
    const response = await axios.get(`/api/market/history/${itemCode}`, { params: { tf } });
    return response.data;
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
};
