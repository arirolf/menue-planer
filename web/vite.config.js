import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true,
    port: 4101,
    // allow importing ../shared (code used by both server and web app)
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:4102',
    },
  },
});
