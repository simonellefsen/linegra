import { defineConfig } from 'vitest/config';

// Unit tests target pure logic (DNA parsing/classification, AI fallbacks), so the
// default Node environment is enough — no jsdom needed. Globals are off; tests
// import { describe, it, expect } from 'vitest' explicitly to keep lint/types happy.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
