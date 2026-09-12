import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/*
 * HTTPS en desarrollo, con `HTTPS=1`.
 *
 * No es por gusto: la cámara y el micrófono solo existen en un contexto
 * seguro. En `localhost` el navegador lo da por bueno, pero abierta la
 * plataforma por la IP de la red —que es como se comparte con el colegio—
 * `navigator.mediaDevices` sencillamente no está, y las preguntas que se
 * responden grabando dejan de funcionar sin ningún error que lo explique.
 *
 * El certificado es autofirmado, así que el navegador avisa la primera vez y
 * hay que aceptarlo. Es lo que corresponde a un servidor de desarrollo: sirve
 * para que la cámara funcione en una demostración, no para publicar nada.
 *
 * Se activa con el modo propio de Vite (`vite --mode https`) y no con una
 * variable de entorno: en Windows, `HTTPS=1 vite` no funciona desde cmd ni
 * desde PowerShell, y habría que añadir una dependencia solo para eso.
 */
export default defineConfig(({ mode }) => ({
  plugins: [vue(), tailwindcss(), ...(mode === 'https' ? [basicSsl()] : [])],
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
     * Sigue siendo el servidor de desarrollo: cualquiera en la misma red puede
     * abrirlo y la base tiene matrícula real. Sirve para enseñar la
     * plataforma, no para dejarla publicada.
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
}));
