import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './app/router';
import { i18n, currentLanguage } from './app/i18n';
import { onSessionExpired } from './services/http';
import { useAuthStore } from './stores/auth';
import './design-system/tokens.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(i18n);
app.use(router);

document.documentElement.lang = currentLanguage();

/*
 * Cuando la sesión se pierde definitivamente —refresco caducado o revocado—
 * se limpia el estado y se envía al login conservando el destino, para que el
 * usuario vuelva justo donde estaba.
 */
onSessionExpired(() => {
  const auth = useAuthStore(pinia);
  auth.clear();
  if (router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
  }
});

app.mount('#app');
