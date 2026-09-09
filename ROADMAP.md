# ROADMAP.md — Plan de implementación por etapas

Plataforma de evaluación académica y competencias digitales KMK.
Fecha: 2026-09-08 · Última actualización: 2026-09-09

**Estado: etapas 0 a 6 completadas.** El recorrido de extremo a extremo
funciona: un docente crea una evaluación, añade preguntas asociadas a
competencias KMK, publica y asigna; un estudiante responde, recarga sin perder
nada, finaliza y obtiene su nota en la escala alemana con estrellas
accesibles, desglose por competencia y retroalimentación. Editar la evaluación
después no altera ese resultado.

Verificación en el estado actual: **lint limpio, tipos estrictos sin errores,
138 pruebas automatizadas en verde** (42 unitarias de calificación y escala,
96 de integración contra PostgreSQL real) y una prueba de humo del recorrido
completo contra el servidor en ejecución.

Documento hermano: [`PROJECT_ANALYSIS.md`](PROJECT_ANALYSIS.md) (análisis del entorno, inconsistencias detectadas y decisiones D-01…D-10).

---

## 0. Principios que rigen el plan

1. **Cada etapa termina en algo ejecutable y verificable**, no en código a medias. Ninguna etapa se declara cerrada sin que su criterio de aceptación pase realmente.
2. **El recorrido completo (vertical slice) llega temprano.** Al final de la Etapa 6 el flujo ADMIN → evaluación → estudiante → nota → estrellas funciona de extremo a extremo. El resto de etapas añade profundidad, no cimientos.
3. **Nada de `TODO` en camino crítico.** Donde hay dependencia externa real y no provista (Phidias, clave de IA) se entrega una abstracción correcta y un mock funcional y aislado.
4. **Lo que se mide se modela.** Toda estadística exigida en las secciones 26–27 y 49 tiene su columna o índice previsto desde el modelo de datos, no como parche posterior.
5. **La seguridad no es una etapa final.** Auth, RBAC, validación, rate limiting y auditoría entran en la Etapa 2; la Etapa 10 endurece y verifica, no introduce.

## 1. Arquitectura objetivo (resumen)

```
frontend/  Vue 3 + TS + Vite + Pinia + Tailwind + vue-i18n
    │  HTTP (cliente único, tipado, con interceptores)
    ▼
backend/   Express + TS
    routes → middleware (auth, RBAC, validación Zod, rate limit)
           → controllers  (HTTP puro: sin lógica de negocio)
           → services     (reglas de negocio, transacciones)
           → repositories (acceso a datos vía Prisma)
    ▼
PostgreSQL 17

packages/shared/   tipos + esquemas Zod + códigos de error + conversión de escala
                   (importado por backend y frontend: una sola fuente de verdad)
```

Servicios transversales del backend: `CacheService`, `AuditService`, `SettingsService`, `Logger` (pino, con redacción de campos sensibles), `PhidiasClient/Service/SyncService`, `AiProvider`, `AssessmentEngine` + `GraderRegistry`.

### Modelo de datos, núcleo

```
users ──1:1── teachers ──N:M── academic_areas
  │                   └──N:M── subjects
  ├──1:1── students ──N:M── groups
  │
  └── attempts (user_id) ── attempt_answers

assessments ──1:N── assessment_versions ──1:N── questions ──N:1── kmk_competencies
                          │                                └──N:1── kmk_subcompetencies
                          └──1:N── assignments ──1:N── assignment_recipients
                                                              │
                                                        attempts ──1:N── attempt_answers
```

Las cuatro reglas estructurales que sostienen todo lo demás:

- **Los intentos cuelgan de `user_id`**, no de `student_id` → un motor sirve a estudiantes, docentes y capacitación (D-03).
- **Los intentos apuntan a una `assessment_version` inmutable** → los resultados históricos son reproducibles (D-02).
- **`attempt_answers` desnormaliza competencia KMK, puntos, materia, grupo y periodo** → las estadísticas por competencia son un `GROUP BY` sobre una sola tabla (R-03).
- **Los resultados guardan la escala usada** (`grading_scale_id`) → cambiar la escala no reescribe notas ya emitidas (I-07).

---

## 2. Etapas

Correspondencia con las fases de la especificación: la sección 60 define FASE 1…9. Este plan las conserva y añade una Etapa 0 de cimientos, divide el motor de evaluación en backend y frontend (es demasiado grande para una sola etapa verificable), y adelanta la abstracción de Phidias para no bloquearse en el token.

| Etapa | Nombre | FASE spec | Estado |
|---|---|---|---|
| 0 | Cimientos del repositorio | — | ✅ Completada |
| 1 | Arquitectura y modelo de datos | FASE 1 | ✅ Completada |
| 2 | Backend base: auth, RBAC, plataforma | FASE 2 | ✅ Completada |
| 3 | Dominio académico y administración | FASE 2 | ✅ Completada |
| 4 | Integración Phidias | FASE 3 | ✅ Completada y verificada contra la API real |
| 5 | Motor de evaluaciones (backend) | FASE 5 | ✅ Completada |
| 6 | Frontend base + experiencia de evaluación | FASE 4 + 5 | ✅ Completada — **hito de revisión** |
| 7 | Estadísticas KMK y planes de evaluación | FASE 6 | Pendiente |
| 8 | Capacitación KMK y evaluación docente | FASE 7 | Pendiente |
| 9 | Generación con IA | FASE 8 | Pendiente · requiere clave de Google |
| 10 | Endurecimiento y entrega | FASE 9 | Pendiente |

---

### Etapa 0 — Cimientos del repositorio

**Objetivo:** que cualquiera pueda clonar, instalar y arrancar en un comando, con calidad automatizada desde el primer commit.

**Alcance**
- `git init`, `.gitignore`, monorepo npm workspaces (`backend`, `frontend`, `packages/shared`).
- TypeScript en modo `strict` real (incluye `noUncheckedIndexedAccess`, prohibición de `any` vía ESLint).
- ESLint + Prettier + `lint-staged` + hook de pre-commit.
- `.env.example` con todas las variables de la sección 56; `.env` local con la conexión ya verificada; secretos jamás versionados.
- `docker-compose.yml` (postgres 17 + backend + frontend) — para paridad de entorno, no obligatorio en desarrollo local, que usará el PostgreSQL ya instalado.
- Creación de `medienpass_dev` y `medienpass_test` con locale ICU.
- Estructura de `docs/` y esqueleto de los ocho documentos de la sección 55.

**Criterio de aceptación:** `npm install` en la raíz, `npm run lint`, `npm run typecheck` y `npm run test` pasan en verde con el proyecto vacío. La conexión a `medienpass_dev` responde.

---

### Etapa 1 — Arquitectura y modelo de datos

**Objetivo:** cerrar el diseño antes de escribir lógica, para no pagar migraciones destructivas más adelante.

**Alcance**
- `docs/ARCHITECTURE.md`: capas, módulos, flujo de dependencias, convenciones, dónde vive cada tipo de lógica y por qué.
- `docs/DATABASE.md`: diagrama, tabla por tabla, claves, índices, restricciones, estrategia de soft delete y de versionado.
- `docs/API.md`: contrato REST completo, formato de respuesta y catálogo de códigos de error.
- `schema.prisma` completo y primera migración versionada.
- Semilla base: roles, permisos, las 6 competencias KMK, escalas por defecto (estudiante 1.0–6.0 / docente 0–100 %), configuración inicial (70 % y 80 %).
- Semilla demo (sección 78): 1 admin, 3 docentes, 30 estudiantes, 4 grupos, 4 materias, 3 evaluaciones.

**Detalle relevante del modelo**
- Catálogo `question_types` en base de datos (código, familia, esquema del payload, si admite calificación automática) → añadir un tipo nuevo no requiere migración de las evaluaciones existentes (sección 14).
- `kmk_competencies` → `kmk_subcompetencies` → `kmk_indicators` desde el inicio, aunque los dos últimos niveles nazcan vacíos (sección 12).
- `academic_years` y `academic_periods` con `external_id` previsto para Phidias.
- Índices pensados para las consultas de las secciones 26–27, no genéricos.

**Criterio de aceptación:** `prisma migrate dev` aplica desde cero sobre base vacía; el seed carga sin errores; una consulta de ejemplo por competencia KMK se ejecuta con plan indexado (`EXPLAIN`).

---

### Etapa 2 — Backend base: autenticación, RBAC y plataforma

**Objetivo:** el esqueleto de servidor sobre el que todo módulo posterior se apoya sin reinventar nada.

**Alcance**
- Servidor Express tipado, arranque, apagado ordenado, healthcheck.
- **Auth:** login, refresh rotativo, logout, cambio de contraseña, recuperación; Argon2id; bloqueo por intentos fallidos.
- **RBAC:** roles y permisos en base de datos, middleware `requirePermission()` + guardas de propiedad y de alcance (un docente solo ve sus grupos).
- Middleware de validación Zod (`params`, `query`, `body`), sanitización, Helmet, CORS por lista blanca, rate limiting (global y estricto en login/IA).
- Manejo centralizado de errores con la taxonomía completa de la sección 45 y respuestas `{ success, data }` / `{ success, error }`.
- Logging estructurado con redacción obligatoria (contraseñas, tokens, documentos).
- `SettingsService` tipado y cacheado, `CacheService`, `AuditService`.
- Módulo `users` completo (CRUD, roles, idioma preferido, estado de cuenta).

**Criterio de aceptación:** tests de integración cubriendo login correcto, credenciales inválidas, token expirado, token manipulado, acceso denegado por rol, acceso denegado por propiedad, rate limit disparado y payload inválido → 422 con el código correcto. Auditoría registrando LOGIN/LOGOUT y las acciones administrativas.

---

### Etapa 3 — Dominio académico y administración

**Objetivo:** que exista el mundo sobre el que se evalúa: áreas, materias, docentes, estudiantes, grupos, años y periodos.

**Alcance**
- Módulos `areas`, `subjects`, `academic_years`, `academic_periods`, `teachers`, `students`, `groups`, `kmk` (gestión de competencias, subcompetencias e indicadores).
- Relaciones docente↔área, docente↔materia, agrupación por nivel y grupo de trabajo (sección 8).
- Grupos con docente responsable, materia, nivel, año académico e inscripción de estudiantes.
- Listados con paginación, filtros y orden estandarizados (un solo helper, no uno por módulo).
- Configuración del sistema y de escalas (sección 23/54) con versionado de escalas.

**Criterio de aceptación:** un ADMIN puede, vía API con tests de integración: crear un área → crear una materia → crear un docente y asignarle área y materia → crear un grupo → inscribir estudiantes → editar la escala de estudiantes y ver que se crea una versión nueva en lugar de mutar la vigente.

---

### Etapa 4 — Integración Phidias

**Objetivo:** que Phidias sea la fuente oficial de estudiantes sin que su token salga jamás del backend.

**Alcance**
- `PhidiasClient`: timeout, reintentos con retroceso exponencial, manejo diferenciado de 401/403/404/429/5xx, cortacircuitos, caché de 5 minutos vía `CacheService`, logging sin datos sensibles.
- `PhidiasService` con los métodos de la sección 10, cada uno con su esquema de validación y su mapper.
- `PhidiasMockService` **totalmente separado**, seleccionable por `PHIDIAS_MODE=mock|live`, sin posibilidad de mezcla con producción (sección 77).
- `PhidiasSyncService`: fetch → validar → normalizar → upsert por (`external_source`, `external_id`) → auditar en `phidias_sync_logs`. Nunca borra: marca `enrollment_status` / `active = false`.
- Minimización de datos aplicada en el mapper (lista blanca, R-06).
- `POST /api/integrations/phidias/sync/students` protegido por permiso de administración, idempotente, con informe de resultados (creados / actualizados / desactivados / rechazados).
- Comando `npm run phidias:probe` para contrastar los contratos reales cuando llegue el token.

**Criterio de aceptación:** con el mock, la sincronización crea 30 estudiantes; una segunda ejecución no duplica ninguno; retirar un estudiante de la respuesta lo desactiva pero no lo elimina; un fallo 500 de Phidias devuelve `502` con código propio sin dejar la base a medias. Tests con respuestas simuladas, sin llamadas reales.

**Nota de dependencia:** sin token (P-01) la etapa se completa contra el mock. La validación contra el entorno real es una tarea de cierre posterior, acotada al mapper.

---

### Etapa 5 — Motor de evaluaciones (backend)

**Objetivo:** el corazón del sistema. Un único motor, genérico, desacoplado de Vue.

**Alcance**
- `assessments` + `assessment_versions`: crear, editar borrador, publicar (congela la versión), archivar, duplicar, nueva versión desde una publicada.
- `questions`: los 13 tipos de la sección 14, con `payload` validado por esquema propio de cada tipo y competencia KMK obligatoria por pregunta (sección 16).
- `GraderRegistry`: un *grader* por familia de tipo, con puntuación parcial donde corresponde; los tipos abiertos quedan marcados para calificación manual.
- `assignments` + `assignment_recipients`: asignación a estudiante, grupo o varios grupos, con ventana, intentos permitidos, límite de tiempo y estados de la sección 24.
- `AssessmentEngine`: disponibilidad, inicio de intento, guardado incremental de respuestas (idempotente), reanudación tras recarga, control de tiempo autoritativo en servidor, envío, calificación, cálculo de porcentaje, conversión de escala, desglose por competencia y generación de retroalimentación.
- Calificación manual de respuestas abiertas por el docente, con recálculo del resultado del intento.

**Criterio de aceptación:** batería de tests que cubre cada tipo de pregunta (correcta / parcial / incorrecta / vacía), los cortes de puntuación 0 %, 69,99 %, 70 %, 80 % y 100 %, la conversión a 1.0–6.0 en cada frontera de banda, la reanudación de un intento, el rechazo de una respuesta enviada fuera de tiempo, y la prueba clave de integridad histórica: **publicar → resolver → editar creando versión 2 → el resultado antiguo permanece idéntico**.

---

### Etapa 6 — Frontend base y experiencia de evaluación

**Objetivo:** la aplicación deja de ser una API y se vuelve utilizable. Aquí se cierra el recorrido completo.

**Alcance**
- Design system sobre Tailwind: tokens (color, tipografía, espaciado, radios, sombras) y componentes base (botón, input, select, tabla, card, modal, toast, badge, tabs, paginación, estados de carga/vacío/error). Sin colores sueltos por componente (sección 63).
- Layout con barra lateral adaptada al rol, cabecera, selector de idioma, perfil.
- i18n real es/de/en desde el primer componente, incluyendo mensajes de error traducidos por código (D-06); idioma preferido persistido por usuario.
- Autenticación, guardas de ruta por permiso, cliente HTTP único con refresco transparente.
- Pantallas de administración de la Etapa 3 y constructor de evaluaciones con editor por tipo de pregunta y asignación de competencia KMK.
- **Runner de evaluación** (sección 37): progreso, temporizador, navegación entre preguntas, mapa de estado, autoguardado con *debounce*, recuperación tras recarga, confirmación antes de finalizar. Diseñado para tablet.
- Pantalla de resultado: porcentaje, nota 1.0–6.0, **estrellas accesibles** (nunca solo color o icono: número, etiqueta textual y `aria-label`, con la explicación de que 1.0 es el mejor resultado), retroalimentación y desglose por competencia.

**Criterio de aceptación:** el recorrido de la sección 82 completo en el navegador, verificado además por un test E2E de Playwright: admin crea docente → área → grupo → evaluación con preguntas y KMK → publica → asigna → el estudiante entra, responde, recarga a mitad y no pierde respuestas, finaliza, ve porcentaje, nota, estrellas y retroalimentación. Los tres idiomas conmutan sin texto sin traducir en las pantallas cubiertas.

---

### Etapa 7 — Estadísticas KMK y planes de evaluación

**Objetivo:** convertir los datos ya capturados en información pedagógica.

**Alcance**
- Servicio de estadísticas con **filtros centralizados** (año, periodo, área, materia, docente, grado, grupo, competencia) — una sola implementación reutilizada por todos los cuadros de mando, para que ningún número se contradiga (sección 50).
- Analítica por competencia: promedio, número de preguntas, porcentaje de acierto, nivel alcanzado y evolución temporal; identificación automática de fortaleza y debilidad (sección 74).
- Los tres cuadros de mando de la sección 26 con gráficos (ECharts).
- Perfiles de estudiante y de docente (secciones 51–52).
- `evaluation_plans` + ítems por periodo: crear, editar, duplicar, activar, asignar y **seguimiento de cumplimiento**.

**Criterio de aceptación:** tests que verifican los agregados contra datos sembrados de resultado conocido (incluido el caso de una evaluación que mide varias competencias, sección 75) y que los mismos filtros aplicados en dos cuadros de mando distintos devuelven cifras coherentes. Consultas de estadística sobre volumen de prueba por debajo del umbral acordado.

---

### Etapa 8 — Capacitación KMK y evaluación docente

**Objetivo:** cerrar el circuito docente reutilizando el motor, sin un segundo sistema.

**Alcance**
- `teacher_training_modules` / `contents` / `progress`, estructurados por competencia (contenido, vídeos, documentos, enlaces, actividades).
- Evaluación de módulo apoyada en el mismo `AssessmentEngine` con `audience = TEACHER`, `purpose = TRAINING`.
- Escala docente 0–100 % con aprobación configurable (80 % por defecto) resuelta por la misma maquinaria de escalas.
- Contenido inicial para las seis competencias y seguimiento de progreso individual y agregado.

**Criterio de aceptación:** un docente recorre un módulo, realiza su evaluación, obtiene resultado porcentual y estado de aprobación según el umbral configurado, y su progreso aparece en el cuadro de mando administrativo. Cero código de motor duplicado (verificable por revisión: los servicios de capacitación no implementan puntuación propia).

---

### Etapa 9 — Generación con IA

**Objetivo:** acelerar la creación de evaluaciones sin ceder el control pedagógico.

**Alcance**
- `AiProvider` como interfaz + adaptador del proveedor elegido (P-03) + `AiMockProvider` para tests, sin llamadas reales en la suite.
- Prompts especializados por tipo de evaluación, con contexto de la competencia KMK (nombre, descripción, indicadores) inyectado desde base de datos, no escrito en el prompt a mano.
- Salida estructurada validada con Zod **más** validación semántica (R-05).
- `ai_generation_requests`: parámetros, estado, coste/uso, resultado y versión generada; trazabilidad completa.
- Flujo obligatorio: parámetros → generación → validación → **versión DRAFT** → vista previa → edición del docente → publicación manual. Sin atajos.
- Límite de tasa y de coste por usuario.

**Criterio de aceptación:** con el proveedor simulado, una generación válida produce una versión borrador editable; una respuesta malformada o semánticamente inválida se rechaza sin persistir nada y devuelve un error accionable; no existe ninguna ruta de código capaz de publicar automáticamente lo generado (verificado por test).

---

### Etapa 10 — Endurecimiento y entrega

**Objetivo:** pasar de "funciona" a "se puede operar".

**Alcance**
- Revisión de seguridad completa, cabeceras, CORS, CSRF, cookies, dependencias auditadas, verificación de que ningún secreto ni dato sensible aparece en logs o respuestas.
- Accesibilidad WCAG AA: contraste, foco, navegación por teclado, `aria`, lectores de pantalla; auditoría específica del runner de evaluación y de las estrellas.
- Rendimiento: revisión de planes de consulta, índices, paginación, *code splitting*, carga diferida, caché; prueba de carga con el volumen objetivo de la sección 67 (500 docentes / 5.000 estudiantes / 100.000 intentos).
- Cobertura de pruebas y suite E2E completa de los criterios de la sección 59.
- Documentación final: los ocho documentos de la sección 55 al día, más registro de decisiones.
- `docker-compose` de producción, variables de entorno documentadas, guía de despliegue agnóstica de proveedor.

**Criterio de aceptación:** los 26 criterios de la sección 59 demostrables; suite completa en verde; sin hallazgos de seguridad de severidad alta; auditoría de accesibilidad sin fallos bloqueantes.

---

## 3. Secuencia y dependencias

```
0 ──▶ 1 ──▶ 2 ──▶ 3 ──┬──▶ 4  (Phidias · desbloqueo real con token)
                      │
                      └──▶ 5 ──▶ 6 ──┬──▶ 7
                                     ├──▶ 8
                                     └──▶ 9  (IA · requiere proveedor)
                                              │
                                              ▼
                                             10
```

Las etapas 4, 7, 8 y 9 son independientes entre sí una vez alcanzada la 6: pueden reordenarse según prioridad de negocio sin cambiar el diseño.

**Hito clave — final de la Etapa 6:** el sistema es demostrable de extremo a extremo. Recomiendo tratarlo como punto de revisión formal antes de continuar.

## 4. Qué necesito para arrancar

| Ref | Necesidad | Bloquea | Alternativa mientras tanto |
|---|---|---|---|
| P-01 | `PHIDIAS_BASE_URL` y `PHIDIAS_TOKEN` | Validación real de la Etapa 4 | Mock aislado; el ajuste posterior queda confinado al mapper |
| P-02 | Cómo se autentican los estudiantes | Alta de cuentas en Etapa 4 | Cuentas en `PENDING_ACTIVATION` con contraseña temporal emitida por ADMIN |
| P-03 | Proveedor y clave de IA | Etapa 9 | Proveedor simulado; el adaptador real es un archivo |
| P-04 | Nombre visible e idioma por defecto | Cosmético | "Medienpass", idioma por defecto español |

Ninguna de estas cuatro impide comenzar por las Etapas 0 a 3, que son la mayor parte de los cimientos.
