import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
    const fileEnv = loadEnv(mode, '.', '');
    const runtimeEnv = { ...process.env, ...fileEnv };
    const passthroughEnvKeys = [
      'GEMINI_API_KEY',
      'OPENROUTER_API_KEY',
      'OPENROUTER_MODEL',
      'OPENROUTER_BASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY'
    ];
    const definedEnv = passthroughEnvKeys.reduce<Record<string, string>>((acc, key) => {
      const value = runtimeEnv[key] ?? runtimeEnv[`VITE_${key}`] ?? '';
      acc[`process.env.${key}`] = JSON.stringify(value);
      return acc;
    }, {});
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        ...definedEnv,
        'process.env.API_KEY': JSON.stringify(runtimeEnv.GEMINI_API_KEY ?? runtimeEnv.VITE_GEMINI_API_KEY ?? '')
      },
      resolve: {
        alias: {
          '@': path.resolve(rootDir, '.'),
        }
      }
    };
});
