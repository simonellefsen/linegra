export type StoredAdmin = {
  username: string;
  password: string;
  mustReset: boolean;
};

const STORAGE_KEY = 'LINEGRA_SUPER_ADMIN';
const defaultAdmin: StoredAdmin = {
  username: 'linegra',
  password: 'linegra',
  mustReset: true
};

let memoryStore: StoredAdmin = { ...defaultAdmin };

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readFromStorage = (): StoredAdmin | null => {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.username === 'string' && typeof parsed.password === 'string') {
      return {
        username: parsed.username,
        password: parsed.password,
        mustReset: Boolean(parsed.mustReset)
      };
    }
    return null;
  } catch {
    return null;
  }
};

const writeToStorage = (data: StoredAdmin) => {
  if (isBrowser) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
};

export const ensureBootstrapAdmin = (): StoredAdmin => {
  const stored = readFromStorage();
  if (stored) {
    memoryStore = stored;
    return stored;
  }
  writeToStorage(defaultAdmin);
  memoryStore = { ...defaultAdmin };
  return memoryStore;
};

export const getAdminCredentials = (): StoredAdmin => {
  return ensureBootstrapAdmin();
};

export const saveAdminCredentials = (creds: StoredAdmin) => {
  memoryStore = { ...creds };
  writeToStorage(memoryStore);
};

export const verifyAdminCredentials = (username: string, password: string) => {
  const creds = ensureBootstrapAdmin();
  const valid = creds.username === username && creds.password === password;
  return { valid, mustReset: creds.mustReset };
};
