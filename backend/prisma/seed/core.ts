import type { PrismaClient } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  ASSESSMENT_AUDIENCE,
  DEFAULT_STUDENT_PASSING_PERCENTAGE,
  DEFAULT_STUDENT_SCALE_BANDS,
  DEFAULT_TEACHER_PASSING_PERCENTAGE,
  ROLE,
  ROLE_PERMISSIONS,
  SCALE_KIND,
  SETTING_DEFINITIONS,
  splitPermission,
  type Permission,
  type Role,
} from '@medienpass/shared';
import { KMK_COMPETENCIES } from './data/kmk.js';

/**
 * Semilla base: lo que el sistema necesita para funcionar, con independencia
 * de los datos del colegio. Es idempotente — puede ejecutarse sobre una base
 * ya sembrada sin duplicar nada.
 */

export async function seedPermissionsAndRoles(prisma: PrismaClient): Promise<void> {
  for (const code of ALL_PERMISSIONS) {
    const { resource, action } = splitPermission(code);
    await prisma.permission.upsert({
      where: { code },
      create: { code, resource, action },
      update: { resource, action },
    });
  }

  const roleNames: Record<Role, { es: string; de: string; en: string }> = {
    [ROLE.ADMIN]: { es: 'Administrador', de: 'Administrator', en: 'Administrator' },
    [ROLE.TEACHER]: { es: 'Docente', de: 'Lehrkraft', en: 'Teacher' },
    [ROLE.STUDENT]: { es: 'Estudiante', de: 'Schüler/in', en: 'Student' },
  };

  for (const [code, permissions] of Object.entries(ROLE_PERMISSIONS) as [Role, Permission[]][]) {
    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name: roleNames[code], isSystem: true },
      update: { name: roleNames[code] },
    });

    const permissionRows = await prisma.permission.findMany({
      where: { code: { in: [...permissions] } },
      select: { id: true },
    });

    // Se reemplaza el conjunto completo para que quitar un permiso del
    // catálogo se refleje al volver a sembrar.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionRows.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }

  console.warn(
    `  roles: ${Object.keys(ROLE_PERMISSIONS).length} · permisos: ${ALL_PERMISSIONS.length}`,
  );
}

export async function seedKmkFramework(prisma: PrismaClient): Promise<void> {
  let subcompetencyCount = 0;

  for (const [index, competency] of KMK_COMPETENCIES.entries()) {
    const created = await prisma.kmkCompetency.upsert({
      where: { code: competency.code },
      create: {
        code: competency.code,
        name: competency.name,
        description: competency.description,
        color: competency.color,
        icon: competency.icon,
        position: index,
      },
      update: {
        name: competency.name,
        description: competency.description,
        color: competency.color,
        icon: competency.icon,
        position: index,
      },
    });

    for (const [subIndex, sub] of competency.subcompetencies.entries()) {
      await prisma.kmkSubcompetency.upsert({
        where: { code: sub.code },
        create: {
          competencyId: created.id,
          code: sub.code,
          name: sub.name,
          description: sub.description ?? undefined,
          position: subIndex,
        },
        update: { name: sub.name, position: subIndex },
      });
      subcompetencyCount += 1;
    }
  }

  console.warn(
    `  competencias KMK: ${KMK_COMPETENCIES.length} · subcompetencias: ${subcompetencyCount}`,
  );
}

/**
 * Escalas por defecto.
 *
 * Se crean como versión 1. Cuando el administrador modifique una escala en
 * uso, el servicio creará la versión 2 en lugar de mutar ésta, porque los
 * resultados ya emitidos apuntan a la versión con la que se calcularon.
 */
export async function seedGradingScales(prisma: PrismaClient): Promise<void> {
  const studentScale = await prisma.gradingScale.upsert({
    where: { code_version: { code: 'student-default', version: 1 } },
    create: {
      code: 'student-default',
      version: 1,
      name: {
        es: 'Escala alemana 1.0 – 6.0',
        de: 'Deutsche Notenskala 1,0 – 6,0',
        en: 'German scale 1.0 – 6.0',
      },
      audience: ASSESSMENT_AUDIENCE.STUDENT,
      kind: SCALE_KIND.BANDED,
      passingPercentage: DEFAULT_STUDENT_PASSING_PERCENTAGE,
      lowerIsBetter: true,
      isActive: true,
    },
    update: {},
  });

  const bandLabels: Record<number, { es: string; de: string; en: string }> = {
    1: { es: 'Excelente', de: 'Sehr gut', en: 'Excellent' },
    2: { es: 'Bueno', de: 'Gut', en: 'Good' },
    3: { es: 'Satisfactorio', de: 'Befriedigend', en: 'Satisfactory' },
    4: { es: 'Suficiente', de: 'Ausreichend', en: 'Sufficient' },
    5: { es: 'Insuficiente', de: 'Mangelhaft', en: 'Poor' },
    6: { es: 'Deficiente', de: 'Ungenügend', en: 'Insufficient' },
  };

  for (const band of DEFAULT_STUDENT_SCALE_BANDS) {
    await prisma.gradingScaleBand.upsert({
      where: { scaleId_position: { scaleId: studentScale.id, position: band.position } },
      create: {
        scaleId: studentScale.id,
        position: band.position,
        value: band.value,
        minPercentage: band.minPercentage,
        label: bandLabels[band.value] ?? { es: band.label, de: band.label, en: band.label },
        color: band.color,
      },
      update: {
        value: band.value,
        minPercentage: band.minPercentage,
        label: bandLabels[band.value] ?? { es: band.label, de: band.label, en: band.label },
        color: band.color,
      },
    });
  }

  // Los docentes se evalúan en porcentaje puro: sin bandas ni estrellas.
  await prisma.gradingScale.upsert({
    where: { code_version: { code: 'teacher-default', version: 1 } },
    create: {
      code: 'teacher-default',
      version: 1,
      name: {
        es: 'Porcentaje 0 – 100 %',
        de: 'Prozent 0 – 100 %',
        en: 'Percentage 0 – 100%',
      },
      audience: ASSESSMENT_AUDIENCE.TEACHER,
      kind: SCALE_KIND.PERCENTAGE,
      passingPercentage: DEFAULT_TEACHER_PASSING_PERCENTAGE,
      lowerIsBetter: false,
      isActive: true,
    },
    update: {},
  });

  console.warn(
    `  escalas: estudiante 1.0–6.0 (aprueba con ${DEFAULT_STUDENT_PASSING_PERCENTAGE} %) · ` +
      `docente 0–100 % (aprueba con ${DEFAULT_TEACHER_PASSING_PERCENTAGE} %)`,
  );
}

export async function seedSystemSettings(prisma: PrismaClient): Promise<void> {
  for (const [key, definition] of Object.entries(SETTING_DEFINITIONS)) {
    await prisma.systemSetting.upsert({
      where: { key },
      // Solo se crea: no se pisa un valor que el administrador ya haya cambiado.
      create: {
        key,
        value: definition.defaultValue as never,
        description: definition.description,
      },
      update: { description: definition.description },
    });
  }
  console.warn(`  configuración: ${Object.keys(SETTING_DEFINITIONS).length} claves`);
}

/**
 * Niveles y grados. Reproducen la estructura real del colegio tal como la
 * devuelve Phidias, pero como entidades propias y estables: los
 * identificadores de Phidias cambian cada curso y no sirven de ancla.
 */
export async function seedEducationStructure(prisma: PrismaClient): Promise<void> {
  const structure: Array<{
    code: string;
    name: { es: string; de: string; en: string };
    grades: Array<{ code: string; name: string; ordinal: number | null }>;
  }> = [
    {
      code: 'KINDERGARTEN',
      name: { es: 'Preescolar', de: 'Kindergarten', en: 'Kindergarten' },
      grades: [
        { code: 'KKP', name: 'KINDERKRIPPE', ordinal: null },
        { code: 'PK', name: 'PREKINDER', ordinal: null },
        { code: 'KIN', name: 'KINDER', ordinal: null },
      ],
    },
    {
      code: 'PRIMARIA',
      name: { es: 'Primaria', de: 'Grundschule', en: 'Primary' },
      grades: Array.from({ length: 6 }, (_, i) => ({
        code: `K${i + 1}`,
        name: `KLASSE ${i + 1}`,
        ordinal: i + 1,
      })),
    },
    {
      code: 'SECUNDARIA',
      name: { es: 'Secundaria', de: 'Sekundarstufe', en: 'Secondary' },
      grades: Array.from({ length: 6 }, (_, i) => ({
        code: `K${i + 7}`,
        name: `KLASSE ${i + 7}`,
        ordinal: i + 7,
      })),
    },
  ];

  let gradeCount = 0;
  let position = 0;

  for (const [levelIndex, level] of structure.entries()) {
    const educationLevel = await prisma.educationLevel.upsert({
      where: { code: level.code },
      create: { code: level.code, name: level.name, position: levelIndex },
      update: { name: level.name, position: levelIndex },
    });

    for (const grade of level.grades) {
      await prisma.gradeLevel.upsert({
        where: { code: grade.code },
        create: {
          educationLevelId: educationLevel.id,
          code: grade.code,
          name: { es: grade.name, de: grade.name, en: grade.name },
          ordinal: grade.ordinal,
          position,
        },
        update: { educationLevelId: educationLevel.id, position },
      });
      position += 1;
      gradeCount += 1;
    }
  }

  console.warn(`  estructura: ${structure.length} niveles · ${gradeCount} grados`);
}
