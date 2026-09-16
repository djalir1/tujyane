import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Bind to all interfaces so both http://127.0.0.1:5173 and http://localhost:5173
  // work — Vite 5 defaults to IPv6 localhost only, which broke tools calling
  // 127.0.0.1 directly.
  server: { port: 5173, host: true, strictPort: true },
});
