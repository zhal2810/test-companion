export const normalizeWareraPayload = (payload: any): any => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const nestedCandidates = [
    payload.company,
    payload.data,
    payload.result?.data,
    payload.result,
    payload.user,
    payload.profile
  ];
  for (const candidate of nestedCandidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  return payload;
};

export const extractCompanyReferences = (payload: any): any[] => {
  const source = payload?.data ?? payload;

  if (Array.isArray(source)) {
    return source;
  }

  const candidateKeys = ['items', 'companies', 'companyIds', 'ids', 'data'];
  for (const key of candidateKeys) {
    const candidate = source?.[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  if (source && typeof source === 'object') {
    for (const value of Object.values(source)) {
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
};

export const normalizeCompanyDetail = (payload: any): any => {
  if (!payload) return null;

  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return normalizeWareraPayload(payload);
  }

  return null;
};
