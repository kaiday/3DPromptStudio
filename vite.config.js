import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backendTarget = process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8018';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '127.0.0.1',
    port: 5189,
    strictPort: true
  }
});
