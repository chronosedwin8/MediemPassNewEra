# DATABASE.md

Modelo de datos de Medienpass sobre PostgreSQL 17.

Fuente de verdad: [`../backend/prisma/schema.prisma`](../backend/prisma/schema.prisma). Este documento explica el porqué de las decisiones; el esquema explica el qué.

---

## 1. Convenciones

| Aspecto | Decisión |
|---|---|
| Claves primarias | UUID v7 (`uuid(7)`). Ordenables por tiempo, lo que da localidad en los índices B-tree sin exponer un contador secuencial. |
| Nombres | Tablas y columnas en `snake_case`; el cliente Prisma expone `camelCase`. |
| Marcas de tiempo | `created_at` y `updated_at` en toda entidad mutable. |
| Borrado | Lógico (`deleted_at`) en lo que se referencia históricamente; físico solo en tablas efímeras. |
| Textos de catálogo | `JSONB` con forma `{ es, de, en }`. Aplica a competencias, áreas, materias, etiquetas de escala y títulos de módulos. |
| Contenido pedagógico | Texto plano en el idioma de la evaluación. No se traduce: hacerlo automáticamente sería académicamente incorrecto. |
| Dinero y notas | `DECIMAL`, nunca coma flotante. Puntos `DECIMAL(6,2)`, porcentajes `DECIMAL(5,2)`, notas `DECIMAL(4,2)`. |
| Locale | Bases creadas con proveedor ICU (`und`), para que el orden alfabético sea correcto también en alemán. |

### Sobre el borrado lógico y la unicidad

`users` tiene índices únicos completos sobre `email` y `username`. Al borrar lógicamente, el servicio libera esos identificadores: pone `email` a `NULL` y antepone un prefijo al `username`. Se conserva el historial académico del usuario sin bloquear para siempre un correo que la institución puede necesitar reasignar. Se prefirió esto a los índices únicos parciales porque mantiene las búsquedas por clave única del cliente Prisma, que de otro modo habría que degradar a `findFirst`.

## 2. Mapa de entidades

```
                        ┌──────────┐
                        │  users   │  identidad única
                        └────┬─────┘
             ┌───────────────┼───────────────┬──────────────┐
             ▼               ▼               ▼              ▼
        user_roles    user_identities   students       teachers
             │          (LOCAL/ENTRA)       │              │
             ▼                              ▼              ├─▶ teacher_areas
      roles ─▶ role_permissions      group_memberships     └─▶ teacher_subjects
                    │                       │
              permissions                 groups ──▶ academic_years
                                            │     ──▶ grade_levels ──▶ education_levels
                                            └─────▶ subjects ──▶ academic_areas

  kmk_competencies ──▶ kmk_subcompetencies ──▶ kmk_indicators
         │
         ▼
  ┌─────────────┐      ┌────────────────────┐      ┌───────────┐
  │ assessments │─────▶│ assessment_versions│─────▶│ questions │
  └─────────────┘      └─────────┬──────────┘      └───────────┘
                                 │
                                 ▼
                          ┌─────────────┐
                          │ assignments │──▶ assignment_recipients
                          └─────────────┘             │
                                                       ▼
                                          ┌───────────────────────┐
                                          │  assessment_attempts  │
                                          └──────────┬────────────┘
                                                     ▼
                                            ┌─────────────────┐
                                            │ attempt_answers │  ◀── analítica KMK
                                            └─────────────────┘

  grading_scales ──▶ grading_scale_bands        evaluation_plans ──▶ evaluation_plan_items
  training_modules ──▶ training_contents / training_progress
  ai_generation_requests · system_settings · audit_logs · phidias_sync_logs · notifications
```

## 3. Las cuatro decisiones que sostienen el modelo

### 3.1 `users` es la única identidad

`students` y `teachers` son perfiles 1:1 que extienden a `users` con datos de dominio. Los intentos (`assessment_attempts`) referencian `user_id`, no `student_id`.

Esto no es un detalle de estilo: es lo que permite que un único motor de evaluación sirva a estudiantes, a docentes y a la capacitación KMK. Si los intentos colgaran de `students`, evaluar a un docente exigiría una segunda tabla de intentos, un segundo cálculo de puntuación y un segundo conjunto de estadísticas.

`email` es **anulable** a propósito: en la matrícula real del colegio hay estudiantes sin correo. Esas cuentas acceden con credenciales locales emitidas por un administrador, no por SSO.

### 3.2 Evaluación → Versión → Preguntas

`assessments` es un contenedor estable (título, audiencia, materia, autor). Todo lo que puede cambiar vive en `assessment_versions`: nombre, instrucciones, tiempo, configuración de visibilidad de resultados, escala aplicada, y las preguntas.

Reglas:

- Una versión `PUBLISHED` es **inmutable**. Editar crea la versión siguiente en `DRAFT`.
- `assignments` referencia `assessment_version_id`, no `assessment_id`: lo asignado no cambia bajo los pies del estudiante.
- `assessment_attempts` referencia también la versión, y guarda además `grading_scale_id`, `passing_percentage`, `grade_value` y `stars_*`.

El resultado de un intento se puede reconstruir años después con exactitud, aunque la evaluación haya cambiado tres veces y el administrador haya modificado la escala.

### 3.3 Asignación separada de destinatario

La especificación proponía una sola tabla con `student_id` y `group_id` anulables. Se descartó: obliga a consultas con `OR`, impide el seguimiento individual cuando se asigna a un grupo y no resuelve qué ocurre con un estudiante que entra al grupo después.

En su lugar:

- `assignments`: el acto de asignar. Destino (usuario o grupo), ventana temporal, intentos permitidos, límite de tiempo.
- `assignment_recipients`: una fila por persona, con su propio estado (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `EXPIRED`, `CANCELLED`), intentos consumidos y mejor porcentaje.

El seguimiento del cuadro de mando pasa a ser un `GROUP BY status` sobre un índice.

### 3.4 `attempt_answers` desnormaliza para la analítica

Además de la respuesta y su puntuación, cada fila copia en el momento de calificar:

`question_type`, `kmk_competency_id`, `kmk_subcompetency_id`, `subject_id`, `group_id`, `academic_period_id`

Es redundancia deliberada. Sin ella, "porcentaje de acierto en la competencia 4 en octavo grado durante el periodo 1" exigiría recorrer `attempt → version → question` por cada fila. Con ella es un `GROUP BY` sobre índices compuestos:

```
attempt_answers_kmk_competency_id_answered_at_idx
attempt_answers_subject_id_kmk_competency_id_idx
attempt_answers_group_id_kmk_competency_id_idx
attempt_answers_academic_period_id_kmk_competency_id_idx
```

Como los valores se fijan una vez y no se recalculan, además son históricamente correctos: si el estudiante cambia de grupo en marzo, sus respuestas de febrero siguen atribuidas al grupo en el que estaba.

## 4. El modelo híbrido de preguntas

Se normaliza lo que se consulta; se guarda en `JSONB` lo que solo se lee al renderizar y calificar.

| En columnas | En `payload` (JSONB) |
|---|---|
| `type`, `points`, `position`, `difficulty` | opciones y cuál es correcta |
| `kmk_competency_id`, `kmk_subcompetency_id` | pares de relación, grupos, huecos |
| `statement`, `feedback_correct`, `feedback_incorrect` | posiciones correctas de un ordenamiento |
| `assessment_version_id` | zonas de una imagen, coordenadas |

Se descartó una tabla `question_options` normalizada: ninguna estadística agrega a nivel de opción individual, y mantenerla obligaría a dos caminos distintos para leer una pregunta —uno para los tipos de opción y otro para el resto—, con la lógica duplicada que eso arrastra.

El `payload` no es texto libre: se valida contra un esquema Zod propio de cada tipo, definido en `packages/shared/src/schemas/question-payload.ts`, en dos capas —estructura y reglas pedagógicas— para poder responder con códigos de error específicos.

Se descartó igualmente la tabla puente `assessment_questions`: implicaría un banco de preguntas compartido, y una pregunta compartida y editable rompería la inmutabilidad de las versiones que ya la usan. Cuando se implemente el banco, sus elementos se **copiarán** a la versión, no se referenciarán.

## 5. Escalas versionadas

`grading_scales` + `grading_scale_bands`, con `(code, version)` único.

Modificar una escala en uso **no** actualiza sus filas: crea la versión siguiente y desactiva la anterior. Los intentos ya calificados conservan su `grading_scale_id`, de modo que un 3.0 emitido en 2026 sigue significando lo que significaba entonces, aunque en 2028 el umbral de esa banda sea otro.

Las bandas se definen únicamente por `min_percentage`, ordenadas por `position` (0 = mejor resultado). El límite superior se **deriva** de la banda inmediatamente mejor. Consecuencia importante: la escala no puede tener huecos. Con rangos cerrados del tipo `80 – 89,99`, un 89,995 % no pertenecería a ninguna banda; con umbrales, siempre cae en una. Una prueba recorre los 10.001 porcentajes posibles para garantizarlo.

Las estrellas se derivan del número de niveles (`N` niveles → `N-1` estrellas), no de valores fijos, de forma que siguen funcionando si el administrador cambia la cantidad de niveles.

## 6. Estructura académica

### Qué se importa de Phidias y qué no

| Entidad | Origen | Motivo |
|---|---|---|
| `academic_years`, `academic_periods` | Phidias (`external_id`) | Calendario oficial de la institución. |
| `groups` | Phidias (`external_id` + año) | Las secciones son la matrícula real. |
| `students` | Phidias (`external_id`) | Fuente oficial de estudiantes. |
| `academic_areas`, `subjects` | **Curadas por el administrador** | Phidias devuelve 262 "áreas" que incluyen propósitos pedagógicos de preescolar y rúbricas de comportamiento. No son áreas de conocimiento sobre las que agregar estadísticas. |
| `education_levels`, `grade_levels` | Propias, estables | Los identificadores de nivel y grado de Phidias **cambian cada curso** (los niveles pasaron de 14/15/16 a 17/18/19 entre 2025-26 y 2026-27). Anclar a ellos rompería la comparación interanual. |

`groups` lleva la unicidad `(external_source, external_id, academic_year_id)` precisamente porque los identificadores de sección se reasignan cada año; `students.external_id`, en cambio, sí es estable y su unicidad es `(external_source, external_id)`.

### Estados de matrícula

`enrollment_status` es un enum normalizado; `raw_enrollment_status` conserva el texto original de Phidias. La API real devuelve texto libre en español con mayúsculas inconsistentes (`activo`, `inscrito`, `Admitido`, `pendiente`, `suspendido`, `retirado`), y aparecen valores nuevos con el tiempo. El mapeo es tolerante: un valor desconocido cae en `UNKNOWN`, se registra como incidencia de sincronización y **no** interrumpe el proceso.

## 7. Índices

Los índices se diseñaron a partir de las consultas que exigen los cuadros de mando de las secciones 26–27 de la especificación, no por costumbre.

| Consulta que sirve | Índice |
|---|---|
| Evaluaciones pendientes de un estudiante | `assignment_recipients (user_id, status)` |
| Seguimiento de una asignación | `assignment_recipients (assignment_id, status)` |
| Intentos vencidos a cerrar por barrido | `assessment_attempts (status, deadline_at)` |
| Desempeño por competencia y fecha | `attempt_answers (kmk_competency_id, answered_at)` |
| Competencia filtrada por materia / grupo / periodo | tres índices compuestos sobre `attempt_answers` |
| Bandeja de calificación manual pendiente | `attempt_answers (requires_manual_grading, graded_at)` |
| Evaluaciones de un docente | `assessments (created_by_id, deleted_at)` |
| Auditoría por usuario o por acción | `audit_logs (user_id, created_at)`, `(action, created_at)` |

## 8. Entidades que se descartaron

| Propuesta original | Decisión | Motivo |
|---|---|---|
| `assessment_questions` | Eliminada | Implicaría preguntas compartidas entre evaluaciones, incompatible con la inmutabilidad de versiones. |
| `question_options` | Eliminada | Duplicaría el camino de lectura de una pregunta sin aportar capacidad de consulta. |
| `assessment_results` | Fusionada en `assessment_attempts` | Relación 1:1 real; separarla solo añade un JOIN a la consulta más frecuente. |
| `assessment_feedback` | Fusionada | La automática vive en la pregunta; la manual, en `attempt_answers`. |
| `student_groups` como tabla distinta de `groups` | Unificada en `group_memberships` | Eran la misma relación descrita dos veces. |

## 9. Migraciones

```bash
npm run db:migrate      # crea y aplica una migración en desarrollo
npm run db:deploy       # aplica migraciones pendientes (producción)
npm run db:reset        # recrea desde cero y siembra (solo desarrollo)
npm run db:seed         # siembra sin recrear
npm run db:studio       # explorador visual
```

La semilla tiene dos bloques: **base** (roles, permisos, 6 competencias KMK con sus 22 subcompetencias, escalas, configuración, niveles y grados) que es idempotente y debe ejecutarse también en producción; y **demostración** (1 administrador, 3 docentes, 30 estudiantes, 4 grupos, 3 evaluaciones publicadas con 15 preguntas), que se omite fuera de desarrollo.
