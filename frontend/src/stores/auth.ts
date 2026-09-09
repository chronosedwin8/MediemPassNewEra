import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  ROLE,
  hasAnyPermission,
  hasPermission,
  type Language,
  type Permission,
  type Role,
} from '@medienpass/shared';
import { http, setAccessToken, setCsrfToken } from '@/services/http';
import { setLanguage } from '@/app/i18n';

/**
 * Sesión del usuario.
 *
 * El token de acceso no se guarda aquí ni en `localStorage`: vive en el
 * cliente HTTP, en memoria. Lo que persiste entre recargas es la cookie de
 * refresco, `httpOnly`, que el navegador envía sola y JavaScript no puede
 * leer. Por eso `restore()` no lee ningún almacenamiento: simplemente pide
 * al servidor que renueve.
 */

export interface CurrentUser {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  language: Language;
  roles: Role[];
  permissions: Permission[];
  mustChangePassword: boolean;
}

interface SessionResponse {
  user: CurrentUser;
  accessToken: string;
  csrfToken: string;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<CurrentUser | null>(null);
  const initialised = ref(false);
  const loading = ref(false);

  const isAuthenticated = computed(() => user.value !== null);
  const fullName = computed(() =>
    user.value ? `${user.value.firstName} ${user.value.lastName}`.trim() : '',
  );

  const isAdmin = computed(() => user.value?.roles.includes(ROLE.ADMIN) ?? false);
  const isTeacher = computed(() => user.value?.roles.includes(ROLE.TEACHER) ?? false);
  const isStudent = computed(() => user.value?.roles.includes(ROLE.STUDENT) ?? false);

  /**
   * Comprobación de permisos en el cliente.
   *
   * Sirve para decidir qué se muestra, **no** para autorizar: el servidor
   * vuelve a comprobarlo todo. Ocultar un botón es cortesía; impedir la
   * acción es cosa del backend.
   */
  function can(...permissions: Permission[]): boolean {
    return user.value ? hasPermission(user.value.permissions, permissions) : false;
  }

  function canAny(...permissions: Permission[]): boolean {
    return user.value ? hasAnyPermission(user.value.permissions, permissions) : false;
  }

  function applySession(session: SessionResponse): void {
    setAccessToken(session.accessToken);
    setCsrfToken(session.csrfToken);
    user.value = session.user;
    // El idioma del perfil manda sobre el del navegador una vez identificado.
    setLanguage(session.user.language);
  }

  async function login(identifier: string, password: string): Promise<CurrentUser> {
    loading.value = true;
    try {
      const session = await http.post<SessionResponse>(
        '/auth/login',
        { identifier, password },
        { skipRefresh: true },
      );
      applySession(session);
      return session.user;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Restaura la sesión al cargar la aplicación.
   *
   * Si la cookie de refresco sigue siendo válida, el usuario continúa donde
   * lo dejó. Si no, simplemente no hay sesión: no es un error que deba
   * mostrarse.
   */
  async function restore(): Promise<void> {
    if (initialised.value) return;
    loading.value = true;

    try {
      const session = await http.post<SessionResponse>('/auth/refresh', undefined, {
        skipRefresh: true,
      });
      applySession(session);
    } catch {
      user.value = null;
      setAccessToken(null);
    } finally {
      initialised.value = true;
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await http.post('/auth/logout', undefined, { skipRefresh: true });
    } catch {
      // Aunque el servidor no responda, la sesión local se cierra igual.
    } finally {
      clear();
    }
  }

  function clear(): void {
    user.value = null;
    setAccessToken(null);
    setCsrfToken(null);
  }

  async function refreshProfile(): Promise<void> {
    user.value = await http.get<CurrentUser>('/auth/me');
  }

  return {
    user,
    initialised,
    loading,
    isAuthenticated,
    fullName,
    isAdmin,
    isTeacher,
    isStudent,
    can,
    canAny,
    login,
    restore,
    logout,
    clear,
    refreshProfile,
  };
});
