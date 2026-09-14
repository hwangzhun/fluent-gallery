import path from 'path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageVersion),
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      // The frontend source also lives under /api/*.ts. Restrict the dev
      // proxy to runtime API requests so Vite can still serve those modules.
      '^/api/(?!.*\\.ts(?:\\?|$))': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
