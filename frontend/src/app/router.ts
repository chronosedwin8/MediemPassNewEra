import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { PERMISSION, type Permission } from '@medienpass/shared';
import { useAuthStore } from '@/stores/auth';

/**
 * Rutas y guardas.
 *
 * Cada ruta declara los permisos que exige. La guarda los comprueba antes de
 * navegar, lo que evita el parpadeo de mostrar una pantalla y retirarla al
 * instante. Es una comodidad, no una medida de seguridad: la autorización de
 * verdad la aplica el servidor en cada petición.
 */

declare module 'vue-router' {
  interface RouteMeta {
    /** `false` en las rutas públicas. */
    requiresAuth?: boolean;
    /** El usuario necesita al menos uno de estos permisos. */
    permissions?: Permission[];
    /** Oculta la navegación: el runner de evaluación ocupa toda la pantalla. */
    fullscreen?: boolean;
    titleKey?: string;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/modules/auth/LoginView.vue'),
    meta: { requiresAuth: false },
  },

  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/modules/dashboard/DashboardView.vue'),
        meta: { titleKey: 'nav.dashboard' },
      },

      // --- Docente -------------------------------------------------------
      {
        path: 'assessments',
        name: 'assessments',
        component: () => import('@/modules/assessments/AssessmentListView.vue'),
        meta: { permissions: [PERMISSION.ASSESSMENT_READ], titleKey: 'nav.assessments' },
      },
      {
        path: 'assessments/new',
        name: 'assessment-create',
        component: () => import('@/modules/assessments/AssessmentCreateView.vue'),
        meta: { permissions: [PERMISSION.ASSESSMENT_CREATE], titleKey: 'nav.createAssessment' },
      },
      {
        path: 'assessments/:id',
        name: 'assessment-detail',
        component: () => import('@/modules/assessments/AssessmentDetailView.vue'),
        meta: { permissions: [PERMISSION.ASSESSMENT_READ], titleKey: 'assessment.title' },
      },
      {
        path: 'groups',
        name: 'groups',
        component: () => import('@/modules/groups/GroupListView.vue'),
        meta: { permissions: [PERMISSION.GROUP_READ], titleKey: 'nav.groups' },
      },

      // --- Estudiante ----------------------------------------------------
      {
        path: 'my-assessments',
        name: 'my-assessments',
        component: () => import('@/modules/attempts/AssignedListView.vue'),
        meta: { permissions: [PERMISSION.ATTEMPT_TAKE], titleKey: 'nav.myAssessments' },
      },
      {
        path: 'results/:attemptId',
        name: 'attempt-result',
        component: () => import('@/modules/attempts/ResultView.vue'),
        meta: { permissions: [PERMISSION.RESULT_READ_OWN], titleKey: 'result.title' },
      },

      // --- Común ---------------------------------------------------------
      {
        path: 'competencies',
        name: 'competencies',
        component: () => import('@/modules/kmk/CompetencyListView.vue'),
        meta: { permissions: [PERMISSION.KMK_READ], titleKey: 'nav.competencies' },
      },
    ],
  },

  /*
   * El runner vive fuera del layout a propósito: durante una evaluación no
   * debe haber menú lateral ni enlaces que inviten a salir sin querer.
   */
  {
    path: '/attempt/:attemptId',
    name: 'attempt-runner',
    component: () => import('@/modules/attempts/AttemptRunnerView.vue'),
    meta: { permissions: [PERMISSION.ATTEMPT_TAKE], fullscreen: true },
  },

  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/modules/errors/NotFoundView.vue'),
    meta: { requiresAuth: false },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // La sesión se restaura una sola vez, en la primera navegación.
  if (!auth.initialised) await auth.restore();

  const requiresAuth = to.meta.requiresAuth !== false;

  if (requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (!requiresAuth && auth.isAuthenticated && to.name === 'login') {
    return { name: 'dashboard' };
  }

  const required = to.meta.permissions;
  if (required?.length && !auth.canAny(...required)) {
    // Se envía al panel en lugar de a una pantalla de error: el usuario no
    // ha hecho nada mal, simplemente ese apartado no es suyo.
    return { name: 'dashboard' };
  }

  return true;
});
