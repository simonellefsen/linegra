import { describe, expect, it } from 'vitest';
import { decryptRawPayload, encryptRawPayload } from './dnaRawEncryption';

describe('dnaRawEncryption', () => {
  it('round-trips encrypted payloads', async () => {
    const plain = '{"rs1":"AG","rs2":"CT"}';
    const encrypted = await encryptRawPayload(plain, 'test-key-material');
    const restored = await decryptRawPayload(encrypted, 'test-key-material');
    expect(restored).toBe(plain);
  });
});
