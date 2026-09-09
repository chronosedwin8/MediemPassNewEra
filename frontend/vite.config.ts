import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // El backend se sirve bajo el mismo origen en desarrollo, de modo que la
    // cookie de refresco viaja sin necesidad de relajar CORS ni SameSite.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Los gráficos pesan y solo hacen falta en estadísticas: se separan
        // para que el runner de evaluación no cargue nada que no use.
        manualChunks: {
          charts: ['echarts', 'vue-echarts'],
        },
      },
    },
  },
});
