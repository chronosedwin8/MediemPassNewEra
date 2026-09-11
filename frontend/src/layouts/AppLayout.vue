<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  PERMISSION,
  SUPPORTED_LANGUAGES,
  type Language,
  type Permission,
} from '@medienpass/shared';
import { useAuthStore } from '@/stores/auth';
import { LANGUAGE_NAMES } from '@/app/languages';
import { setLanguage } from '@/app/i18n';
import BaseButton from '@/design-system/BaseButton.vue';

/**
 * Estructura de la aplicación: barra lateral, cabecera y contenido.
 *
 * El menú **se construye a partir de los permisos**, no del rol: así, si
 * mañana se crea un rol de coordinación con parte de los permisos de docente,
 * su menú sale bien sin tocar este archivo.
 */

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const mobileMenuOpen = ref(false);

interface NavItem {
  to: string;
  labelKey: string;
  icon: string;
  permissions?: Permission[];
}

interface NavSection {
  labelKey?: string;
  items: NavItem[];
}

/** Trazados de iconos, en un solo sitio para no repetir SVG por el menú. */
const ICONS: Record<string, string> = {
  dashboard:
    'M4 5a1 1 0 011-1h5v7H4V5zm0 9h6v6H5a1 1 0 01-1-1v-5zm10 6v-9h6v8a1 1 0 01-1 1h-5zm6-11h-6V4h5a1 1 0 011 1v4z',
  assessment:
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  users:
    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  chart:
    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  competency:
    'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  help:
    'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  settings:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35A1.724 1.724 0 005.4 8.322c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z',
};

/**
 * Las entradas del menú, como tabla.
 *
 * Cada una declara qué permiso la habilita en lugar de resolverse dentro de una
 * cadena de condicionales: añadir una sección es añadir una fila, y de un
 * vistazo se ve quién ve qué. Con la cadena, cada entrada nueva hacía la
 * función un poco más difícil de leer y un poco más fácil de romper.
 */
interface NavRule {
  item: NavItem;
  /** Basta con tener uno de estos permisos. */
  permissions: Permission[];
}

const TEACHING_NAV: NavRule[] = [
  {
    item: { to: '/assessments', labelKey: 'nav.assessments', icon: 'assessment' },
    permissions: [PERMISSION.ASSESSMENT_READ],
  },
  {
    item: { to: '/groups', labelKey: 'nav.groups', icon: 'users' },
    permissions: [PERMISSION.GROUP_READ],
  },
  {
    item: { to: '/students', labelKey: 'nav.students', icon: 'users' },
    permissions: [PERMISSION.STUDENT_READ],
  },
  {
    item: { to: '/ai/generate', labelKey: 'nav.aiGenerate', icon: 'assessment' },
    permissions: [PERMISSION.AI_GENERATE],
  },
];

const REFERENCE_NAV: NavRule[] = [
  {
    item: { to: '/statistics', labelKey: 'nav.statistics', icon: 'chart' },
    permissions: [PERMISSION.STATS_READ_SCOPED, PERMISSION.STATS_READ_GLOBAL],
  },
  {
    item: { to: '/competencies', labelKey: 'nav.competencies', icon: 'competency' },
    permissions: [PERMISSION.KMK_READ],
  },
  // La capacitación del profesorado usa el mismo motor de evaluación, así que
  // su acceso vive junto al resto del material de referencia.
  {
    item: { to: '/training', labelKey: 'nav.training', icon: 'competency' },
    permissions: [PERMISSION.TRAINING_PARTICIPATE],
  },
  {
    item: { to: '/my-assessments', labelKey: 'nav.myAssessments', icon: 'assessment' },
    permissions: [PERMISSION.ATTEMPT_TAKE],
  },
];

const ADMIN_NAV: NavRule[] = [
  {
    item: { to: '/admin/training', labelKey: 'nav.trainingAdmin', icon: 'competency' },
    permissions: [PERMISSION.TRAINING_MANAGE],
  },
  {
    item: { to: '/admin', labelKey: 'nav.admin', icon: 'settings' },
    permissions: [PERMISSION.SETTINGS_MANAGE],
  },
];

function allowed(rules: NavRule[]): NavItem[] {
  return rules.filter((rule) => auth.canAny(...rule.permissions)).map((rule) => rule.item);
}

/*
 * La guía de uso es pública, pero se enlaza también desde dentro: quien la
 * necesita suele estar a mitad de una tarea, y obligarle a cerrar sesión o a
 * adivinar la dirección para consultarla sería justo el momento equivocado.
 */
const HELP_SECTION: NavSection = {
  items: [{ to: '/wiki', labelKey: 'public.wiki', icon: 'help' }],
};

const sections = computed<NavSection[]>(() => {
  const result: NavSection[] = [
    { items: [{ to: '/panel', labelKey: 'nav.dashboard', icon: 'dashboard' }] },
  ];

  // Estudiante: lo suyo es responder evaluaciones y ver su desempeño. Se
  // resuelve antes que nada porque su menú no es un subconjunto del docente.
  if (auth.can(PERMISSION.ATTEMPT_TAKE) && !auth.can(PERMISSION.ASSESSMENT_CREATE)) {
    result.push({
      items: [
        { to: '/my-assessments', labelKey: 'nav.myAssessments', icon: 'assessment' },
        { to: '/statistics', labelKey: 'nav.statistics', icon: 'chart' },
        { to: '/competencies', labelKey: 'nav.competencies', icon: 'competency' },
      ],
    });
    result.push(HELP_SECTION);
    return result;
  }

  const teaching = allowed(TEACHING_NAV);
  if (teaching.length > 0) result.push({ labelKey: 'nav.assessments', items: teaching });

  const reference = allowed(REFERENCE_NAV);
  if (reference.length > 0) result.push({ labelKey: 'nav.competencies', items: reference });

  const admin = allowed(ADMIN_NAV);
  if (admin.length > 0) result.push({ labelKey: 'nav.admin', items: admin });

  result.push(HELP_SECTION);
  return result;
});

function changeLanguage(event: Event): void {
  setLanguage((event.target as HTMLSelectElement).value as Language);
}

async function signOut(): Promise<void> {
  await auth.logout();
  await router.push({ name: 'login' });
}

const initials = computed(() => {
  const user = auth.user;
  if (!user) return '';
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
});

function isActive(path: string): boolean {
  /*
   * El panel exige coincidencia exacta. Con `startsWith`, `/panel` se
   * marcaría como activo en cualquier ruta que empezara igual, y además es la
   * única entrada del menú que no tiene rutas hijas colgando de ella.
   */
  return path === '/panel' ? route.path === '/panel' : route.path.startsWith(path);
}
</script>

<template>
  <div class="min-h-screen bg-canvas">
    <a class="skip-link" href="#main">{{ t('nav.skipToContent') }}</a>

    <!-- Barra lateral. En pantallas pequeñas se convierte en cajón. -->
    <aside
      class="fixed inset-y-0 left-0 z-40 w-64 -translate-x-full border-r border-border bg-surface transition-transform lg:translate-x-0"
      :class="{ 'translate-x-0': mobileMenuOpen }"
      :aria-hidden="!mobileMenuOpen && undefined"
    >
      <div class="flex h-16 items-center gap-2 border-b border-border px-5">
        <div
          class="flex size-8 items-center justify-center rounded-md bg-brand-600 text-ink-inverse"
        >
          <span class="text-sm font-bold">M</span>
        </div>
        <span class="font-semibold">{{ t('app.name') }}</span>
      </div>

      <nav class="flex flex-col gap-6 p-3" :aria-label="t('nav.dashboard')">
        <div v-for="(section, index) in sections" :key="index" class="flex flex-col gap-1">
          <p
            v-if="section.labelKey"
            class="px-3 py-1 text-xs font-medium uppercase tracking-wide text-ink-subtle"
          >
            {{ t(section.labelKey) }}
          </p>
          <RouterLink
            v-for="item in section.items"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
            :class="
              isActive(item.to)
                ? 'bg-brand-50 font-medium text-brand-700'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            "
            :aria-current="isActive(item.to) ? 'page' : undefined"
            @click="mobileMenuOpen = false"
          >
            <svg
              class="size-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" :d="ICONS[item.icon]" />
            </svg>
            {{ t(item.labelKey) }}
          </RouterLink>
        </div>
      </nav>
    </aside>

    <!-- Velo del cajón en móvil. -->
    <div
      v-if="mobileMenuOpen"
      class="fixed inset-0 z-30 bg-ink/20 lg:hidden"
      aria-hidden="true"
      @click="mobileMenuOpen = false"
    />

    <div class="lg:pl-64">
      <header
        class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6"
      >
        <button
          type="button"
          class="rounded-md p-2 text-ink-muted hover:bg-surface-muted lg:hidden"
          :aria-label="mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')"
          :aria-expanded="mobileMenuOpen"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <h1 class="flex-1 truncate font-semibold">
          {{ route.meta.titleKey ? t(route.meta.titleKey) : t('app.name') }}
        </h1>

        <label class="sr-only" for="language-select">{{ t('common.language') }}</label>
        <select
          id="language-select"
          class="h-9 rounded-md border border-border bg-surface px-2 text-sm text-ink-muted"
          :value="locale"
          @change="changeLanguage"
        >
          <option v-for="code in SUPPORTED_LANGUAGES" :key="code" :value="code">
            {{ LANGUAGE_NAMES[code] }}
          </option>
        </select>

        <div class="flex items-center gap-2">
          <div
            class="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
            :title="auth.fullName"
          >
            {{ initials }}
          </div>
          <BaseButton variant="ghost" size="sm" @click="signOut">
            {{ t('auth.signOut') }}
          </BaseButton>
        </div>
      </header>

      <main id="main" class="mx-auto max-w-7xl p-4 sm:p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
