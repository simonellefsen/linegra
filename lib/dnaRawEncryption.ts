// K7 — Client-side AES-GCM encryption for raw autosomal payloads before persistence.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const deriveAesKey = async (keyMaterial: string): Promise<CryptoKey> => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(keyMaterial));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export const resolveDnaEncryptionKey = (): string | null => {
  const key = import.meta.env.VITE_DNA_ENCRYPTION_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
};

export const canStoreEncryptedRawDna = (): boolean => !!resolveDnaEncryptionKey();

export const encryptRawPayload = async (plainText: string, keyMaterial: string): Promise<string> => {
  const key = await deriveAesKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(plainText)
  );
  const payload = new Uint8Array(iv.length + cipher.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(cipher), iv.length);
  return toBase64(payload);
};

export const decryptRawPayload = async (encoded: string, keyMaterial: string): Promise<string> => {
  const payload = fromBase64(encoded);
  if (payload.length < 13) throw new Error('Encrypted DNA payload is invalid.');
  const iv = payload.slice(0, 12);
  const cipher = payload.slice(12);
  const key = await deriveAesKey(keyMaterial);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return textDecoder.decode(plain);
};

/** Maximum encrypted payload size we inline into dna_tests.metadata (bytes). */
export const MAX_INLINE_ENCRYPTED_RAW_BYTES = 1_500_000;
