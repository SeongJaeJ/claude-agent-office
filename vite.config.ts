import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:7777',
      '/hooks': 'http://localhost:7777',
      '/terminal': {
        target: 'http://localhost:7777',
      },
    },
    // WebSocket 프록시: Vite HMR 이외의 WS 연결을 백엔드로 전달
  },
});
