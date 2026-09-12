import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type RouteLocationRaw,
  type RouteRecordRaw,
} from 'vue-router';
import { PERMISSION, type Permission } from '@medienpass/shared';
import { useAuthStore } from '@/stores/auth';
import { i18n } from '@/app/i18n';

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
    /*
     * Vive fuera del layout: cuando el cambio es obligatorio, no debe haber
     * menú que permita esquivarlo navegando a otra parte.
     */
    path: '/change-password',
    name: 'change-password',
    component: () => import('@/modules/auth/ChangePasswordView.vue'),
    meta: { titleKey: 'auth.changePassword' },
  },

  /*
   * Portada y guía: lo único que se ve sin sesión.
   *
   * Ocupan la raíz porque son la cara pública del proyecto, y el panel se
   * desplaza a `/panel`. El resto de rutas de la aplicación declaran su ruta
   * **absoluta** aunque cuelguen de este layout: así `/assessments` sigue
   * siendo `/assessments` y ningún enlace de la aplicación cambia por haber
   * movido la portada.
   */
  {
    path: '/',
    component: () => import('@/modules/public/PublicLayout.vue'),
    meta: { requiresAuth: false },
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/modules/public/HomeView.vue'),
        meta: { requiresAuth: false },
      },
      {
        path: 'wiki',
        name: 'wiki',
        component: () => import('@/modules/public/WikiView.vue'),
        meta: { requiresAuth: false, titleKey: 'public.wiki' },
      },
    ],
  },

  {
    path: '/panel',
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
        path: '/assessments',
        name: 'assessments',
        component: () => import('@/modules/assessments/AssessmentListView.vue'),
        meta: { permissions: [PERMISSION.ASSESSMENT_READ], titleKey: 'nav.assessments' },
      },
      {
        path: '/assessments/new',
        name: 'assessment-create',
        component: () => import('@/modules/assessments/AssessmentCreateView.vue'),
        meta: { permissions: [PERMISSION.ASSESSMENT_CREATE], titleKey: 'nav.createAssessment' },
      },
      {
        path: '/assessments/:id',
        name: 'assessment-detail',
        component: () => import('@/modules/assessments/AssessmentDetailView.vue'),
        meta: { permissions: [PERMISSION.ASSESSMENT_READ], titleKey: 'assessment.title' },
      },
      {
        path: '/students',
        name: 'students',
        component: () => import('@/modules/students/StudentListView.vue'),
        meta: { permissions: [PERMISSION.STUDENT_READ], titleKey: 'nav.students' },
      },
      {
        path: '/groups',
        name: 'groups',
        component: () => import('@/modules/groups/GroupListView.vue'),
        meta: { permissions: [PERMISSION.GROUP_READ], titleKey: 'nav.groups' },
      },
      {
        path: '/groups/:id',
        name: 'group-detail',
        component: () => import('@/modules/groups/GroupDetailView.vue'),
        meta: { permissions: [PERMISSION.GROUP_READ], titleKey: 'nav.groups' },
      },

      // --- Estudiante ----------------------------------------------------
      {
        path: '/my-assessments',
        name: 'my-assessments',
        component: () => import('@/modules/attempts/AssignedListView.vue'),
        meta: { permissions: [PERMISSION.ATTEMPT_TAKE], titleKey: 'nav.myAssessments' },
      },
      {
        path: '/results/:attemptId',
        name: 'attempt-result',
        component: () => import('@/modules/attempts/ResultView.vue'),
        meta: { permissions: [PERMISSION.RESULT_READ_OWN], titleKey: 'result.title' },
      },

      /*
       * Cola de corrección. Vive fuera del detalle de una evaluación porque lo
       * que se corrige de una tarde son respuestas de varias, y obligar a
       * entrar en cada una convertía treinta correcciones en una tarde entera.
       */
      {
        path: '/review',
        name: 'review',
        component: () => import('@/modules/attempts/ReviewQueueView.vue'),
        meta: { permissions: [PERMISSION.ATTEMPT_GRADE], titleKey: 'review.title' },
      },

      {
        path: '/statistics',
        name: 'statistics',
        component: () => import('@/modules/statistics/StatisticsView.vue'),
        meta: {
          permissions: [
            PERMISSION.STATS_READ_OWN,
            PERMISSION.STATS_READ_SCOPED,
            PERMISSION.STATS_READ_GLOBAL,
          ],
          titleKey: 'nav.statistics',
        },
      },

      /*
       * Previsualización e informe cuelgan de la evaluación, no de
       * estadísticas: se llega a ellos desde la evaluación que se está
       * mirando, y el itinerario del docente es «esta evaluación → cómo se ve»
       * o «esta evaluación → cómo fue», no al revés.
       */
      {
        path: '/assessments/:id/preview/:versionId',
        name: 'assessment-preview',
        component: () => import('@/modules/assessments/AssessmentPreviewView.vue'),
        meta: { permissions: [PERMISSION.ASSESSMENT_READ], titleKey: 'preview.title' },
      },
      {
        path: '/assessments/:id/report',
        name: 'assessment-report',
        component: () => import('@/modules/statistics/AssessmentReportView.vue'),
        meta: {
          permissions: [PERMISSION.STATS_READ_SCOPED, PERMISSION.STATS_READ_GLOBAL],
          titleKey: 'report.title',
        },
      },

      // --- Capacitación docente ------------------------------------------
      {
        path: '/training',
        name: 'training',
        component: () => import('@/modules/training/TrainingListView.vue'),
        meta: { permissions: [PERMISSION.TRAINING_PARTICIPATE], titleKey: 'nav.training' },
      },
      {
        path: '/training/:id',
        name: 'training-module',
        component: () => import('@/modules/training/TrainingDetailView.vue'),
        meta: { permissions: [PERMISSION.TRAINING_PARTICIPATE], titleKey: 'nav.training' },
      },

      // --- Generación con IA ----------------------------------------------
      {
        path: '/ai/generate',
        name: 'ai-generate',
        component: () => import('@/modules/ai/AiGenerateView.vue'),
        meta: { permissions: [PERMISSION.AI_GENERATE], titleKey: 'nav.aiGenerate' },
      },

      // --- Redacción de capacitaciones --------------------------------------
      {
        path: '/admin/training',
        name: 'training-admin',
        component: () => import('@/modules/training/admin/TrainingAdminView.vue'),
        meta: { permissions: [PERMISSION.TRAINING_MANAGE], titleKey: 'training.admin.title' },
      },
      {
        path: '/admin/training/:id',
        name: 'training-admin-module',
        component: () => import('@/modules/training/admin/TrainingModuleEditor.vue'),
        meta: { permissions: [PERMISSION.TRAINING_MANAGE], titleKey: 'training.admin.title' },
      },

      // --- Administración --------------------------------------------------
      {
        path: '/admin',
        name: 'admin',
        component: () => import('@/modules/admin/AdminView.vue'),
        meta: { permissions: [PERMISSION.SETTINGS_MANAGE], titleKey: 'nav.admin' },
      },

      // --- Común ---------------------------------------------------------
      {
        path: '/competencies',
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
  /*
   * Al volver atrás se recupera la posición; con un ancla se va al elemento.
   *
   * Lo segundo hace falta desde que hay páginas públicas: alguien comparte
   * `/wiki#docente-ia` y, sin esto, el navegador intenta saltar al elemento
   * antes de que exista —la vista se carga de forma diferida— y quien abre el
   * enlace aterriza arriba del todo sin saber qué le querían enseñar.
   */
  scrollBehavior: (to, _from, saved) => {
    if (to.hash) return { el: to.hash, top: 80 };
    return saved ?? { top: 0 };
  },
});

type AuthStore = ReturnType<typeof useAuthStore>;

/** Una comprobación devuelve a dónde desviar, o `null` si deja pasar. */
type NavigationGuard = (to: RouteLocationNormalized, auth: AuthStore) => RouteLocationRaw | null;

/**
 * Comprobaciones de navegación, en orden.
 *
 * Expresarlas como una lista y no como una cadena de condicionales tiene una
 * ventaja concreta: añadir una regla nueva es añadir una entrada, y el orden
 * en que se aplican queda a la vista en lugar de esconderse en el anidamiento.
 */
const NAVIGATION_GUARDS: NavigationGuard[] = [
  // Sin sesión, a la pantalla de acceso, conservando el destino.
  (to, auth) =>
    to.meta.requiresAuth !== false && !auth.isAuthenticated
      ? { name: 'login', query: { redirect: to.fullPath } }
      : null,

  // Con sesión, la pantalla de acceso no tiene sentido.
  (to, auth) =>
    to.meta.requiresAuth === false && auth.isAuthenticated && to.name === 'login'
      ? { name: 'dashboard' }
      : null,

  /*
   * Una contraseña emitida por administración ha pasado por manos ajenas: se
   * dicta en clase, se imprime en un listado. Hasta cambiarla, la sesión solo
   * puede entrar en la aplicación por esa pantalla.
   *
   * Las páginas públicas quedan fuera: el objetivo es proteger los datos del
   * colegio, no impedir que alguien con el cambio pendiente lea la guía de uso
   * —que es, precisamente, donde se explica por qué se le está pidiendo.
   */
  (to, auth) =>
    to.meta.requiresAuth !== false &&
    auth.isAuthenticated &&
    auth.user?.mustChangePassword &&
    to.name !== 'change-password'
      ? { name: 'change-password' }
      : null,

  /*
   * Sin permiso, al panel y no a una pantalla de error: el usuario no ha hecho
   * nada mal, simplemente ese apartado no es suyo. La autorización de verdad
   * la aplica el servidor en cada petición; esto solo evita el parpadeo.
   */
  (to, auth) => {
    const required = to.meta.permissions;
    return required?.length && !auth.canAny(...required) ? { name: 'dashboard' } : null;
  },
];

/*
 * El título de la pestaña.
 *
 * Importa sobre todo desde que la raíz es pública: la portada es lo que la
 * gente marca, comparte y encuentra en el historial, y «Medienpass» a secas
 * en diez pestañas abiertas no distingue la guía de la evaluación que se
 * estaba corrigiendo.
 */
router.afterEach((to) => {
  const { t } = i18n.global;
  const name = t('app.name');
  document.title = to.meta.titleKey ? `${t(to.meta.titleKey)} · ${name}` : name;
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // La sesión se restaura una sola vez, en la primera navegación.
  if (!auth.initialised) await auth.restore();

  for (const guard of NAVIGATION_GUARDS) {
    const redirect = guard(to, auth);
    if (redirect) return redirect;
  }

  return true;
});
