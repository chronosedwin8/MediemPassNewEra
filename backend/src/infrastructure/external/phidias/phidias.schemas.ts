import { z } from 'zod';

/**
 * Contratos de la API de Phidias.
 *
 * Verificados contra el entorno real de `ds-barranquilla` el 8 de septiembre
 * de 2026. No se ha inventado ninguno: los endpoints que no funcionan están
 * documentados como tales en `docs/PHIDIAS.md`.
 *
 * Todos los esquemas son **tolerantes**: `passthrough` y campos opcionales por
 * defecto. Phidias añade columnas sin avisar, y una sincronización que se
 * rompe porque apareció un campo nuevo es peor que una que lo ignora.
 */

/** Marca temporal Unix en segundos. Phidias no usa ISO-8601 en ningún sitio. */
const unixSeconds = z.number().int().nonnegative();

export function fromUnixSeconds(value: number | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value * 1000);
}

// --- Áreas -------------------------------------------------------------------
// GET /1/academic/areas  →  array plano, sin envoltura.

export const phidiasAreaSchema = z
  .object({
    id: z.number().int(),
    /** Identificador interno de año (1..7), NO el año calendario. */
    year: z.number().int(),
    name: z.string(),
    name_en: z.string().nullable().optional(),
    iorder: z.number().int().nullable().optional(),
  })
  .passthrough();

export const phidiasAreasResponseSchema = z.array(phidiasAreaSchema);

// --- Materias ----------------------------------------------------------------
// GET /1/academic/subjects?year=N  →  { response: [...] }
// Ojo: las claves llevan espacios. No es un error de transcripción.

export const phidiasSubjectSchema = z
  .object({
    'id subject': z.number().int(),
    subject: z.string(),
    'subject en': z.string().nullable().optional(),
    'id area': z.number().int().nullable().optional(),
    area: z.string().nullable().optional(),
    year: z.number().int(),
  })
  .passthrough();

export const phidiasSubjectsResponseSchema = z.object({
  response: z.array(phidiasSubjectSchema),
});

// --- Periodos ----------------------------------------------------------------
// GET /1/academic/periods  →  { response: [...] }

export const phidiasPeriodSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    year: z.number().int(),
    start_date: unixSeconds,
    end_date: unixSeconds,
    weight: z.number().nullable().optional(),
    /**
     * Familia de periodos. Conviven varias solapadas (académica regular,
     * extracurricular…) y el endpoint que las nombra devuelve 500, así que el
     * administrador designa cuál es la oficial desde la configuración.
     */
    category: z.number().int().nullable().optional(),
  })
  .passthrough();

export const phidiasPeriodsResponseSchema = z.object({
  response: z.array(phidiasPeriodSchema),
});

// --- Matrícula ---------------------------------------------------------------
// GET /1/course/consolidate  →  árbol Nivel → Grado → Sección → Estudiantes.
//
// El objeto de estudiante trae más de sesenta campos, entre ellos documento,
// dirección, teléfono, fecha de nacimiento e incluso un campo `password`. Aquí
// se declaran **solo** los que la plataforma necesita: lo que no se declara no
// se lee, y lo que no se lee no puede filtrarse por descuido a un registro o a
// una respuesta de la API.

export const phidiasEnrollmentSchema = z
  .object({
    /** Texto libre en español, con mayúsculas inconsistentes. */
    status: z.string().nullable().optional(),
    date: unixSeconds.nullable().optional(),
  })
  .passthrough();

export const phidiasStudentSchema = z
  .object({
    id: z.number().int(),
    firstname: z.string().nullable().optional(),
    lastname: z.string().nullable().optional(),
    /**
     * Puede llegar como número: en la matrícula real, 90 de 1.177 estudiantes
     * tienen su código numérico como nombre de usuario. El mapper lo convierte.
     */
    username: z.union([z.string(), z.number()]).nullable().optional(),
    email: z.string().nullable().optional(),
    /** Código institucional. Mezcla números, cadenas y nulos en producción. */
    code: z.union([z.number(), z.string()]).nullable().optional(),
    language: z.string().nullable().optional(),
    enrollment: phidiasEnrollmentSchema.nullable().optional(),
  })
  .passthrough();

export const phidiasSectionSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    students: z.array(phidiasStudentSchema).default([]),
  })
  .passthrough();

export const phidiasCourseSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    sections: z.array(phidiasSectionSchema).default([]),
  })
  .passthrough();

export const phidiasLevelSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    courses: z.array(phidiasCourseSchema).default([]),
  })
  .passthrough();

export const phidiasConsolidateResponseSchema = z.array(phidiasLevelSchema);

export type PhidiasArea = z.infer<typeof phidiasAreaSchema>;
export type PhidiasSubject = z.infer<typeof phidiasSubjectSchema>;
export type PhidiasPeriod = z.infer<typeof phidiasPeriodSchema>;
export type PhidiasStudent = z.infer<typeof phidiasStudentSchema>;
export type PhidiasSection = z.infer<typeof phidiasSectionSchema>;
export type PhidiasCourse = z.infer<typeof phidiasCourseSchema>;
export type PhidiasLevel = z.infer<typeof phidiasLevelSchema>;
