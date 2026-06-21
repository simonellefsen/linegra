export type StoredAdmin = {
  username: string;
  password: string;
  mustReset: boolean;
};

const STORAGE_KEY = 'LINEGRA_SUPER_ADMIN';
const BOOTSTRAP_USERNAME = 'linegra';
const BOOTSTRAP_PASSWORD = 'linegra';

// Convenience credential accepted only on a local-dev host (in addition to the linegra
// bootstrap). Lets you sign in with admin/admin while iterating on localhost.
const DEV_USERNAME = 'admin';
const DEV_PASSWORD = 'admin';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

// On local development the forced credential reset is pure friction, so the default dev account
// logs straight in. On any real host the default must still be renamed/secured. This is evaluated
// at runtime from the hostname, so deployed builds are never affected.
const isLocalDevHost = (): boolean => {
  if (typeof window === 'undefined' || !window.location) return false;
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|.*\.local)$/i.test(window.location.hostname);
};

// The credential pairs that are pre-blessed on a local-dev host: admin/admin and the linegra
// bootstrap. Either signs in one-step with no forced reset.
const isDevCredential = (username: string, password: string): boolean =>
  (username === DEV_USERNAME && password === DEV_PASSWORD) ||
  (username === BOOTSTRAP_USERNAME && password === BOOTSTRAP_PASSWORD);

const buildDefaultAdmin = (): StoredAdmin =>
  isLocalDevHost()
    ? { username: DEV_USERNAME, password: DEV_PASSWORD, mustReset: false }
    : { username: BOOTSTRAP_USERNAME, password: BOOTSTRAP_PASSWORD, mustReset: true };

// On local dev, never force a reset for an untouched default account (even if a prior session
// already persisted mustReset:true to localStorage).
const normalizeAdmin = (admin: StoredAdmin): StoredAdmin =>
  isLocalDevHost() && isDevCredential(admin.username, admin.password)
    ? { ...admin, mustReset: false }
    : admin;

let memoryStore: StoredAdmin = buildDefaultAdmin();

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
    memoryStore = normalizeAdmin(stored);
    return memoryStore;
  }
  const fresh = buildDefaultAdmin();
  writeToStorage(fresh);
  memoryStore = { ...fresh };
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
  // On a local-dev host, admin/admin (and the linegra bootstrap) always sign in one-step,
  // even if localStorage holds different custom credentials. Never applies on a real host.
  if (isLocalDevHost() && isDevCredential(username, password)) {
    return { valid: true, mustReset: false };
  }
  const creds = ensureBootstrapAdmin();
  const valid = creds.username === username && creds.password === password;
  return { valid, mustReset: creds.mustReset };
};
