export const normalizeWareraPayload = (payload: any): any => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  // Handle tRPC v10 style superjson payloads which wrap the actual data under result.data.json or result.data
  // E.g., { result: { data: { json: { ... } } } } or { result: { data: [ ... ] } } or { result: { data: { json: [ ... ] } } }
  let current = payload;

  // 1. Unwrap result
  if (current.result !== undefined) {
    current = current.result;
  }

  // 2. Unwrap data
  if (current.data !== undefined) {
    current = current.data;
  }

  // 3. Unwrap json (superjson wrapper)
  if (current.json !== undefined) {
    current = current.json;
  }

  if (current && typeof current === 'object' && !Array.isArray(current)) {
    // If it's still a nested object containing other candidates like company, user, etc.
    const nestedCandidates = [
      current.company,
      current.user,
      current.profile
    ];
    for (const candidate of nestedCandidates) {
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        return candidate;
      }
    }
  }

  return current;
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
