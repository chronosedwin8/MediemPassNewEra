import type { PrismaClient } from '@prisma/client';

/**
 * Estructura académica del colegio.
 *
 * Las áreas y materias se siembran curadas, no importadas a ciegas: Phidias
 * devuelve 262 "áreas" que incluyen propósitos pedagógicos y rúbricas de
 * preescolar, que no son áreas de conocimiento sobre las que tenga sentido
 * agregar estadísticas. `PhidiasService` las expone para que el administrador
 * escoja; la sincronización automática nunca las crea.
 */

interface AreaSeed {
  code: string;
  name: { es: string; de: string; en: string };
  color: string;
  subjects: Array<{ code: string; name: { es: string; de: string; en: string } }>;
}

const AREAS: AreaSeed[] = [
  {
    code: 'MAT',
    name: { es: 'Matemáticas', de: 'Mathematik', en: 'Mathematics' },
    color: '#2563eb',
    subjects: [
      { code: 'MAT-GEN', name: { es: 'Matemáticas', de: 'Mathematik', en: 'Mathematics' } },
      { code: 'MAT-GEO', name: { es: 'Geometría', de: 'Geometrie', en: 'Geometry' } },
    ],
  },
  {
    code: 'CNAT',
    name: { es: 'Ciencias Naturales', de: 'Naturwissenschaften', en: 'Natural Sciences' },
    color: '#059669',
    subjects: [
      { code: 'BIO', name: { es: 'Biología', de: 'Biologie', en: 'Biology' } },
      { code: 'FIS', name: { es: 'Física', de: 'Physik', en: 'Physics' } },
      { code: 'QUI', name: { es: 'Química', de: 'Chemie', en: 'Chemistry' } },
    ],
  },
  {
    code: 'LENG',
    name: { es: 'Lenguas', de: 'Sprachen', en: 'Languages' },
    color: '#c026d3',
    subjects: [
      { code: 'ALE', name: { es: 'Alemán', de: 'Deutsch', en: 'German' } },
      { code: 'ESP', name: { es: 'Español', de: 'Spanisch', en: 'Spanish' } },
      { code: 'ING', name: { es: 'Inglés', de: 'Englisch', en: 'English' } },
    ],
  },
  {
    code: 'CSOC',
    name: { es: 'Ciencias Sociales', de: 'Gesellschaftswissenschaften', en: 'Social Sciences' },
    color: '#d97706',
    subjects: [
      { code: 'HIS', name: { es: 'Historia', de: 'Geschichte', en: 'History' } },
      { code: 'GEO', name: { es: 'Geografía', de: 'Geographie', en: 'Geography' } },
    ],
  },
  {
    code: 'TEC',
    name: { es: 'Tecnología', de: 'Technik', en: 'Technology' },
    color: '#7c3aed',
    subjects: [
      { code: 'INF', name: { es: 'Informática', de: 'Informatik', en: 'Computer Science' } },
      { code: 'TEC-GEN', name: { es: 'Tecnología', de: 'Technik', en: 'Technology' } },
    ],
  },
  {
    code: 'EFIS',
    name: { es: 'Educación Física', de: 'Sport', en: 'Physical Education' },
    color: '#0891b2',
    subjects: [{ code: 'EFI', name: { es: 'Educación Física', de: 'Sport', en: 'Physical Education' } }],
  },
];

export async function seedAreasAndSubjects(prisma: PrismaClient): Promise<void> {
  let subjectCount = 0;

  for (const area of AREAS) {
    const created = await prisma.academicArea.upsert({
      where: { code: area.code },
      create: { code: area.code, name: area.name, color: area.color },
      update: { name: area.name, color: area.color },
    });

    for (const subject of area.subjects) {
      await prisma.subject.upsert({
        where: { code: subject.code },
        create: { code: subject.code, name: subject.name, areaId: created.id },
        update: { name: subject.name, areaId: created.id },
      });
      subjectCount += 1;
    }
  }

  console.warn(`  áreas: ${AREAS.length} · materias: ${subjectCount}`);
}

/**
 * Año académico vigente y sus periodos.
 *
 * Los valores reproducen el calendario real que devuelve Phidias para el
 * curso 2026-2027 (`year = 6`). La sincronización los actualizará; sembrarlos
 * permite trabajar sin depender de la API desde el primer minuto.
 */
export async function seedAcademicYear(prisma: PrismaClient): Promise<void> {
  const year = await prisma.academicYear.upsert({
    where: { code: '2026-2027' },
    create: {
      code: '2026-2027',
      name: 'Año escolar 2026 – 2027',
      externalId: 6,
      startDate: new Date('2026-08-01'),
      endDate: new Date('2027-06-24'),
      isCurrent: true,
    },
    update: { isCurrent: true, externalId: 6 },
  });

  // Solo un año puede ser el vigente.
  await prisma.academicYear.updateMany({
    where: { id: { not: year.id } },
    data: { isCurrent: false },
  });

  const periods = [
    {
      name: 'Periodo 1',
      externalId: 67,
      externalCategoryId: 6,
      position: 0,
      startDate: '2026-08-01',
      endDate: '2026-12-14',
      weight: 40,
    },
    {
      name: 'Periodo 2',
      externalId: 68,
      externalCategoryId: 6,
      position: 1,
      startDate: '2026-12-15',
      endDate: '2027-06-24',
      weight: 60,
    },
  ];

  for (const period of periods) {
    const existing = await prisma.academicPeriod.findFirst({
      where: { academicYearId: year.id, position: period.position },
    });
    const data = {
      academicYearId: year.id,
      externalId: period.externalId,
      externalCategoryId: period.externalCategoryId,
      name: period.name,
      position: period.position,
      startDate: new Date(period.startDate),
      endDate: new Date(period.endDate),
      weight: period.weight,
    };
    if (existing) {
      await prisma.academicPeriod.update({ where: { id: existing.id }, data });
    } else {
      await prisma.academicPeriod.create({ data });
    }
  }

  console.warn(`  año académico: ${year.code} (vigente) · periodos: ${periods.length}`);
}
