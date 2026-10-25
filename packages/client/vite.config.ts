import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server stays on localhost; devices on the LAN load the built assets from the Fastify server.
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
      '/api': 'http://localhost:8080',
    },
  },
});
