import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
export default defineConfig(async () => {
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    plugins: [
      react(),
      sites(),
      cloudflare({ config: { main: './worker/index.js' } }),
    ],
    server: { host: '127.0.0.1' },
  };
});
