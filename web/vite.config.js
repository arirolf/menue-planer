import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true,
    port: 4101,
    proxy: {
      '/api': 'http://localhost:4100',
    },
  },
});
