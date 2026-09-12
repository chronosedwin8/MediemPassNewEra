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
    /*
     * Escucha en todas las interfaces para poder abrirlo desde otro equipo de
     * la red local. Solo hace falta exponer este puerto: el backend sigue en
     * `localhost` y quien entra desde fuera llega a él a través del proxy de
     * abajo, no directamente.
     *
     * Es el servidor de desarrollo. Sirve para enseñar la plataforma en el
     * colegio, no para dejarla publicada: no hay HTTPS, cualquiera en la misma
     * red puede abrirla, y la base tiene matrícula real.
     */
    host: true,
    // El backend se sirve bajo el mismo origen en desarrollo, de modo que la
    // cookie de refresco viaja sin necesidad de relajar CORS ni SameSite.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        /*
         * Se reescribe `Origin` al que el backend espera.
         *
         * Para el navegador esto **es** mismo origen: la página y la API salen
         * del mismo host y el mismo puerto. La cabecera solo llega al backend
         * porque el proxy la reenvía tal cual, y entonces, al abrir la
         * aplicación desde otro equipo de la red, el backend ve
         * `http://192.168.1.x:5173`, no lo encuentra en su lista blanca y
         * responde 500 a cualquier intento de identificarse.
         *
         * La alternativa sería ir añadiendo direcciones IP a `CORS_ORIGIN`,
         * que cambian con cada arranque del router y obligan a relajar la
         * lista del servidor. Reescribirla aquí deja esa lista estricta y
         * arregla la causa: la petición no es de terceros, lo parecía.
         */
        headers: { Origin: 'http://localhost:5173' },
      },
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
