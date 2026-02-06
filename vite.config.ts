import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const passthroughEnvKeys = [
      'GEMINI_API_KEY',
      'OPENROUTER_API_KEY',
      'OPENROUTER_MODEL',
      'OPENROUTER_BASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY'
    ];
    const definedEnv = passthroughEnvKeys.reduce<Record<string, string>>((acc, key) => {
      const value = env[key] ?? env[`VITE_${key}`] ?? '';
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
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(rootDir, '.'),
        }
      }
    };
});
