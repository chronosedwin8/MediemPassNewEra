# PROJECT_ANALYSIS.md

Fecha del análisis: 2026-09-08
Directorio: `C:\Users\eortiz\Desktop\MediempassNewEra`

---

## 1. Estado actual del repositorio

**El directorio está completamente vacío.** No existe código, configuración, historial de Git ni base de datos previa asociada al proyecto.

| Comprobación | Resultado |
|---|---|
| Archivos / carpetas | 0 |
| Repositorio Git | No inicializado |
| `package.json` | No existe |
| Documentación previa | No existe |
| `.env` / secretos | No existen |

**Consecuencia:** no hay código funcional que preservar ni riesgo de sobrescritura. La regla 61 ("no destruyas código existente") se cumple trivialmente. Partimos de un greenfield, lo que permite aplicar la arquitectura objetivo sin deuda técnica heredada.

## 2. Entorno de desarrollo detectado

| Componente | Versión detectada | Estado |
|---|---|---|
| Node.js | v24.14.0 | OK (≥ 20 requerido por Vite / Prisma actuales) |
| npm | 11.9.0 | OK (soporta workspaces) |
| Git | 2.53.0.windows.2 | OK |
| Docker | 29.1.5 | OK (opcional en dev, útil para paridad de despliegue) |
| PostgreSQL | **17.10** (servicio `postgresql-x64-17`, en ejecución) | OK — cumple el requisito de PG 17 |
| `psql` en PATH | No | Menor: se invoca por ruta absoluta `C:\Program Files\PostgreSQL\17\bin\psql.exe` |
| Sistema operativo | Windows 11 Pro (26200) | Shell primario PowerShell |

### Conexión a PostgreSQL

Verificada correctamente con las credenciales de desarrollo suministradas por el equipo (usuario `postgres` en `localhost:5432`). La contraseña vive únicamente en el `.env` local, que no se versiona.

Bases de datos existentes en la instancia — **todas ajenas a este proyecto, no se tocarán**:
`bookstudio`, `bookstudio_test`, `codexia_db`, `talento`, `ticketwati`.

Se crearán bases nuevas y aisladas:

- `medienpass_dev` — desarrollo
- `medienpass_test` — tests de integración (se resetea en cada corrida)

### Observaciones técnicas del entorno

1. **Locale de la instancia:** `Spanish_Spain.1252` con encoding UTF8. El ordenamiento alfabético será correcto para español, pero para alemán (ß, diéresis) conviene crear las bases del proyecto con proveedor de locale ICU (`und-x-icu`). Decisión: crear las bases con ICU, independientemente del locale del servidor.
2. **Windows como entorno de desarrollo:** evitar rutas POSIX en scripts de `package.json` y dependencias con compilación nativa frágil (`bcrypt` nativo → se usará Argon2 con binario precompilado; ver D-04).
3. **Las credenciales de PostgreSQL son solo de desarrollo local.** Nunca entran al repositorio: viven exclusivamente en `.env` (ignorado por Git); `.env.example` lleva valores ficticios. Al desplegar se emitirán credenciales distintas.

## 3. Revisión crítica de la especificación

La especificación es sólida y detallada. Estos son los puntos ambiguos, redundantes o riesgosos que detecté. Para cada uno indico la decisión adoptada (regla 61: ante ambigüedad, la solución más robusta, documentada).

### 3.1 Inconsistencias y redundancias del modelo

| # | Hallazgo | Decisión adoptada |
|---|---|---|
| I-01 | La sección 13 define en `assessments` tanto `type` (STUDENT/TEACHER) como `target_type`, que expresan lo mismo. | Se unifican en dos ejes ortogonales: `audience` (`STUDENT` \| `TEACHER`) y `purpose` (`EVALUATION` \| `TRAINING`). Elimina la ambigüedad y permite que la capacitación docente reutilice el motor sin inventar un tercer tipo. |
| I-02 | La sección 41 lista `assessment_questions` **y** `questions`, lo que insinúa un banco de preguntas reutilizable, mientras la sección 15 ata `assessment_id` dentro de la propia pregunta. | Las preguntas pertenecen a una **versión** de evaluación (`assessment_version_id`); no hay tabla puente. Un banco de preguntas futuro se modelará como plantillas que se **copian** hacia la versión, nunca referenciadas, para no romper la integridad histórica (sección 73). Se elimina `assessment_questions`. |
| I-03 | La sección 41 propone `question_options` como tabla y la 15 propone JSONB para el contenido específico del tipo. Mantener ambos duplica la lógica de lectura de una pregunta. | **Modelo híbrido con criterio explícito:** columnas normalizadas para todo lo que se consulta o agrega (tipo, puntos, orden, dificultad, competencia KMK) y un único `payload JSONB` validado por un esquema Zod por tipo para el contenido específico (opciones, pares, zonas, huecos). Se elimina `question_options`: las estadísticas nunca agregan a nivel de opción individual. |
| I-04 | La sección 24 coloca `student_id` y `group_id` en la misma fila de asignación, lo que obliga a consultas con `OR` e imposibilita el seguimiento individual cuando se asigna a un grupo. | Se separa en `assignments` (el acto de asignar: destino, ventana, intentos, configuración) y `assignment_recipients` (una fila por usuario destinatario con su propio estado). El seguimiento se vuelve una consulta indexada simple y resuelve el caso "un estudiante entra al grupo después de asignada la evaluación". |
| I-05 | `students` y `users` aparecen como entidades separadas, pero un estudiante debe autenticarse. | `users` es la tabla de identidad única; `students` y `teachers` son **perfiles 1:1** que la extienden con datos de dominio. Los intentos referencian `user_id`, no `student_id`: ésta es la pieza que permite un único motor para estudiantes, docentes y capacitación (sección 29). |
| I-06 | `TIMELINE` y `ORDERING` son funcionalmente el mismo tipo (ordenar una secuencia). | Se conservan ambos códigos por valor pedagógico y de UI, pero comparten el mismo *grader* interno. Sin lógica duplicada. |
| I-07 | Las escalas se describen como "configuración" (sección 23) pero deben preservarse históricamente (sección 73). Si viven como un JSON mutable en `system_settings`, cambiar la escala reescribe el significado de notas ya emitidas. | Las escalas son **entidades versionadas**: `grading_scales` + `grading_scale_bands`. Editar una escala activa crea una nueva versión; cada resultado guarda el `grading_scale_id` usado y la nota calculada. `system_settings` queda solo para configuración sin efecto histórico. |
| I-08 | La sección 41 lista `assessment_results` y `assessment_feedback` como tablas separadas del intento. | `assessment_results` se fusiona en `assessment_attempts` (es una relación 1:1 real; separarla solo añade un JOIN). La retroalimentación automática vive en la pregunta; la manual del docente vive en `attempt_answers` (`teacher_feedback`, `teacher_score`, `graded_by`, `graded_at`). Se elimina `assessment_feedback`. |

### 3.2 Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R-01 | **No se ha suministrado el token de Phidias ni hay contratos verificados de sus endpoints.** El formato real de `GET /1/course/consolidate` es desconocido y la sección 61 prohíbe inventar respuestas. | Se construye `PhidiasClient` + `PhidiasService` contra una **interfaz explícita**, con `PhidiasMockService` alimentado únicamente por el ejemplo real que aparece en la especificación. Los esquemas Zod se escriben tolerantes a campos desconocidos y la normalización se aísla en un único mapper. Al llegar el token se ejecuta un comando de sondeo (`npm run phidias:probe`) que registra las respuestas reales y el ajuste queda confinado a ese mapper. |
| R-02 | La sincronización crea usuarios que deben poder iniciar sesión, pero Phidias no entrega credenciales. | Bloqueante de producto (pregunta P-02). Diseño por defecto: cuenta en estado `PENDING_ACTIVATION`, sin contraseña utilizable, con activación o contraseña temporal emitida por ADMIN. |
| R-03 | Las estadísticas por competencia KMK, si se calculan atravesando `attempt → answer → question → version`, se degradan con 100.000 intentos. | `attempt_answers` **desnormaliza** al momento de calificar: `kmk_competency_id`, `points_earned`, `points_possible`, `subject_id`, `group_id`, `period_id`. Toda estadística KMK pasa a ser un `GROUP BY` sobre una única tabla indexada. Vistas materializadas solo si la medición las justifica. |
| R-04 | Confiar el temporizador al cliente permite trampa trivial. | El servidor es la única autoridad: ventana calculada desde `started_at` en backend, rechazo de respuestas fuera de plazo (con margen de gracia configurable), autoenvío perezoso al detectar expiración y barrido programado de intentos vencidos. |
| R-05 | La IA puede devolver texto no conforme o preguntas pedagógicamente inválidas (p. ej. sin respuesta correcta). | Salida estructurada + validación Zod estricta + **validador semántico propio** (toda pregunta de opción con ≥1 correcta, puntos > 0, competencia KMK existente). Nunca se persiste una respuesta no validada y nunca se publica automáticamente: siempre aterriza como versión `DRAFT`. |
| R-06 | Datos personales de menores: Phidias puede devolver documento, dirección, teléfono, fecha de nacimiento. | Minimización por diseño: el mapper tiene **lista blanca** de campos (`external_id`, nombres, email, username, código, estado de matrícula, idioma); todo lo demás se descarta antes de tocar la base. Redacción obligatoria en logs. |
| R-07 | El alcance total (26 módulos) no es entregable ni verificable en un solo paso. | Plan por etapas con criterio de aceptación ejecutable en cada una y un *vertical slice* funcional lo antes posible (ver `ROADMAP.md`). |

### 3.3 Decisiones arquitectónicas iniciales

| # | Decisión | Justificación |
|---|---|---|
| D-01 | **Monorepo con npm workspaces**: `backend/`, `frontend/`, `packages/shared/`, `docs/`, `tests/e2e/`, `docker/`. | `packages/shared` aloja tipos, códigos de error y esquemas Zod compartidos: una sola fuente de verdad para los DTOs, imposible que front y back se desincronicen. |
| D-02 | **Evaluación → Versión → Preguntas → Intento → Respuestas.** Una versión publicada es inmutable; editarla crea una nueva versión `DRAFT`. Las asignaciones fijan `assessment_version_id`. | Trazabilidad académica y reproducibilidad de resultados históricos (secciones 72–73). |
| D-03 | **Un único motor de evaluación** (`AssessmentEngine`), parametrizado por `audience` + `purpose`, operando sobre `user_id`. | Evita construir cuatro sistemas (estudiante / docente / capacitación / IA) y unifica las estadísticas por competencia. |
| D-04 | **Argon2id** para contraseñas, con binario precompilado (`@node-rs/argon2`). | Cumple la exigencia de seguridad sin build nativo frágil en Windows. |
| D-05 | **JWT de acceso corto (15 min) + refresh token rotativo en cookie httpOnly**, hasheado en base de datos, con doble envío CSRF en el endpoint de refresco. | Un JWT de larga vida en `localStorage` es el fallo de seguridad más común en plataformas de este tipo. |
| D-06 | **Errores por código, no por mensaje**: la API devuelve `{ code, message, details }` y el frontend traduce el `code`. | La sección 40 exige errores y validaciones traducibles a es/de/en; el texto del backend no puede ser la fuente de lo mostrado. |
| D-07 | **`CacheService` como interfaz**, con implementación en memoria (TTL, 5 min por defecto para Phidias) y una Redis intercambiable por variable de entorno. | Sección 46, sin acoplar el sistema a memoria ni obligar a Redis desde el día uno. |
| D-08 | Tests unitarios y de integración junto a su paquete (`backend/src/**/*.spec.ts`, `backend/tests/integration/`); `tests/e2e/` en la raíz para Playwright. | Desviación consciente del entregable "/tests" monolítico de la sección 68: acercar el test al código es lo que mantiene viva la suite. El E2E sí es transversal. |
| D-09 | **Idioma del contenido ≠ idioma de la interfaz.** La evaluación tiene su propio `language`; sus preguntas no se traducen. La interfaz se traduce íntegramente con `vue-i18n`. | Traducir contenido pedagógico automáticamente sería académicamente incorrecto: el docente crea la evaluación en el idioma que corresponde. |
| D-10 | **Soft delete** (`deleted_at`) en entidades referenciadas históricamente (usuarios, evaluaciones, grupos, materias) con **índices únicos parciales** (`WHERE deleted_at IS NULL`). Borrado físico solo en tablas efímeras. | Evita romper resultados históricos y las colisiones de unicidad tras un borrado lógico. |

## 4. Preguntas abiertas

- **P-01 — Phidias:** ¿están disponibles ya el token y la URL base? Mientras no lo estén se avanza con abstracción + mock, sin mezclar datos ficticios con producción (sección 77).
- **P-02 — Autenticación de estudiantes:** ¿credenciales locales emitidas por el administrador o SSO/credenciales de Phidias? Determina el flujo de alta durante la sincronización.
- **P-03 — Proveedor de IA:** ¿Anthropic (Claude), OpenAI u otro? Determina el adaptador concreto; la abstracción y el mock son idénticos en cualquier caso.
- **P-04 — Nombre e idioma por defecto:** el directorio sugiere "Medienpass" (Medienkompetenzrahmen, coherente con las competencias KMK). Confirmar el nombre visible y el idioma por defecto de la plataforma.
