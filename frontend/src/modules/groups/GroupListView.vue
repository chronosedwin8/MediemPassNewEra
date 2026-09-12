<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PERMISSION, localize, type LocalizedText } from '@medienpass/shared';
import { http } from '@/services/http';
import BaseCard from '@/design-system/BaseCard.vue';
import BaseButton from '@/design-system/BaseButton.vue';
import BaseSpinner from '@/design-system/BaseSpinner.vue';
import EmptyState from '@/design-system/EmptyState.vue';
import GroupFormDialog from './GroupFormDialog.vue';
import { useAuthStore } from '@/stores/auth';

/** Grupos a cargo del usuario. El alcance lo aplica el servidor. */

interface Group {
  id: string;
  code: string;
  studentCount: number;
  gradeLevel: { code: string; name: LocalizedText };
  subject: { code: string } | null;
  homeroomTeacher: { firstName: string; lastName: string } | null;
}

const { t, locale } = useI18n();
const auth = useAuthStore();
const groups = ref<Group[]>([]);
const loading = ref(true);
const creando = ref(false);

/*
 * Los docentes también crean grupos, no solo administración.
 *
 * Es deliberado en el diseño de permisos: quien lleva un curso sabe qué
 * grupos necesita y cuándo, y hacerle pedirlo a administración cada vez
 * convierte una tarea de dos minutos en un trámite de dos días.
 */
const puedeCrear = computed(() => auth.can(PERMISSION.GROUP_CREATE));

async function cargar(): Promise<void> {
  loading.value = true;
  try {
    const result = await http.list<Group>('/groups', { pageSize: 100 });
    groups.value = result.items;
  } finally {
    loading.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="flex flex-col gap-4">
    <header v-if="puedeCrear" class="flex justify-end">
      <BaseButton @click="creando = true">{{ t('group.create') }}</BaseButton>
    </header>

    <BaseSpinner v-if="loading" size="lg" />

    <!--
      El vacío con salida.
      
      Una instalación nueva no tiene ni un grupo, y un estado vacío que solo
      dice «no hay grupos» deja a quien administra sin saber qué hacer
      después. Aquí mismo está el botón que lo resuelve.
    -->
    <EmptyState v-else-if="groups.length === 0" :title="t('group.empty')">
      <template #action>
        <BaseButton v-if="puedeCrear" @click="creando = true">{{ t('group.create') }}</BaseButton>
      </template>
    </EmptyState>

    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <BaseCard v-for="group in groups" :key="group.id" class="relative">
        <!--
        La tarjeta entera es el enlace, no solo el título: en una rejilla de
        tarjetas la gente pulsa donde le viene, y obligar a acertar el texto
        del encabezado es una molestia gratuita.
      -->
        <RouterLink
          :to="`/groups/${group.id}`"
          class="text-lg font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span class="absolute inset-0" aria-hidden="true" />
          {{ group.code }}
        </RouterLink>
        <p class="mt-1 text-sm text-ink-muted">
          {{ localize(group.gradeLevel.name, locale as never) }}
          <span v-if="group.subject"> · {{ group.subject.code }}</span>
        </p>
        <p class="mt-3 text-sm tabular-nums">
          {{ t('group.studentCount', { count: group.studentCount }) }}
        </p>
        <p v-if="group.homeroomTeacher" class="mt-1 text-xs text-ink-subtle">
          {{ t('group.homeroomTeacher') }}: {{ group.homeroomTeacher.firstName }}
          {{ group.homeroomTeacher.lastName }}
        </p>
      </BaseCard>
    </div>

    <GroupFormDialog
      v-if="creando"
      @saved="
        creando = false;
        cargar();
      "
      @cancel="creando = false"
    />
  </div>
</template>
