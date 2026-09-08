# ARCHITECTURE.md

Arquitectura de Medienpass. Decisiones, capas y convenciones.

Documentos relacionados: [`DATABASE.md`](DATABASE.md) · [`API.md`](API.md) · [`SECURITY.md`](SECURITY.md) · [`PHIDIAS.md`](PHIDIAS.md) · [`../PROJECT_ANALYSIS.md`](../PROJECT_ANALYSIS.md)

---

## 1. Vista general

```
┌──────────────────────────────────────────────────────────────┐
│  frontend/   Vue 3 · TypeScript · Vite · Pinia · Tailwind     │
│              vue-i18n (es · de · en)                          │
└───────────────────────────┬──────────────────────────────────┘
                            │  HTTPS · JSON · cliente único tipado
┌───────────────────────────▼──────────────────────────────────┐
│  backend/    Node · Express · TypeScript                      │
│                                                               │
│   routes ──▶ middleware ──▶ controllers ──▶ services ──▶ repos│
│              auth · RBAC        HTTP puro     negocio    datos│
│              validación                                       │
│              rate limit                                       │
│                                                               │
│   servicios transversales:                                    │
│     AssessmentEngine · GraderRegistry · SettingsService        │
│     CacheService · AuditService · PhidiasService · AiProvider  │
└───────────────────────────┬──────────────────────────────────┘
                            │  Prisma
┌───────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 17                                                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  packages/shared/   tipos · esquemas Zod · códigos de error   │
│                     conversión de escala · catálogo de        │
│                     permisos · claves de configuración        │
│                     (importado por backend Y frontend)        │
└──────────────────────────────────────────────────────────────┘
```

### Por qué un paquete compartido

Es la pieza que impide la clase de fallo más común en aplicaciones cliente-servidor: que el frontend y el backend dejen de estar de acuerdo sobre la forma de un dato. En `packages/shared` viven:

- El vocabulario del dominio (`enums.ts`): estados, roles, tipos de pregunta.
- Los esquemas Zod de contenido de preguntas y de respuestas: el servidor valida con ellos y el cliente construye su estado con ellos.
- El catálogo de códigos de error: el servidor los emite y el cliente los traduce.
- El catálogo de permisos: el servidor los exige y el cliente decide qué menús muestra.
- La conversión de porcentaje a escala 1.0–6.0: el servidor la persiste y el cliente la usa para previsualizar sin pedir permiso al servidor.

## 2. Reglas de dependencia

El flujo de dependencias es unidireccional. Romperlo es el camino más corto a un sistema imposible de probar.

| Capa | Puede depender de | Nunca depende de |
|---|---|---|
| Rutas | Middleware, controladores | Servicios, Prisma |
| Middleware | Servicios, `shared` | Controladores |
| Controladores | Servicios, DTOs | Prisma, otros controladores |
| Servicios | Repositorios, otros servicios, `shared` | Express (`req`, `res`) |
| Repositorios | Prisma | Servicios, Express |

Consecuencias prácticas:

- **Un controlador no contiene lógica de negocio.** Lee la petición ya validada, llama a un servicio y traduce el resultado a HTTP. Si un controlador supera unas pocas decenas de líneas, la lógica está en el sitio equivocado.
- **Un servicio no conoce Express.** No recibe `req` ni `res`, no lanza respuestas HTTP; lanza `AppError` con un código de dominio. Esto es lo que permite probarlo sin levantar un servidor y reutilizarlo desde un comando o una tarea programada.
- **`AssessmentEngine` no conoce Vue ni Express.** Es lógica pura de dominio sobre datos, tal como exige la especificación.

## 3. Estructura de carpetas

```
backend/src/
  config/              env.ts — configuración validada con Zod al arrancar
  shared/
    errors/            AppError, ExternalServiceError
    security/          hasheo de contraseñas, tokens
    cache/             CacheService (memoria | Redis)
    http/              helpers de respuesta, asyncHandler
    logger.ts
  infrastructure/
    database/          cliente Prisma
    external/          clientes HTTP de terceros
  middleware/          autenticación, RBAC, validación, errores, rate limit
  modules/
    auth/              controller · service · routes · dto
    users/
    teachers/
    students/
    groups/
    areas/  subjects/  academic/
    kmk/
    assessments/
      grading/         un calificador por familia de tipo de pregunta
      engine/          AssessmentEngine
    assignments/
    attempts/
    statistics/
    training/
    ai/
    settings/
    audit/
    integrations/phidias/
  app.ts               composición de Express
  server.ts            arranque y apagado ordenado

frontend/src/
  app/                 arranque, router, pinia, i18n
  design-system/       tokens y componentes base
  components/          componentes de dominio reutilizables
  composables/         lógica de vista reutilizable
  layouts/
  modules/             una carpeta por dominio: vistas + store + api
  services/            cliente HTTP único
  locales/             es.json · de.json · en.json
  stores/
```

Cada módulo del backend es autónomo: sus rutas, su controlador, su servicio y sus DTO viven juntos. Se navega por dominio, no por tipo de archivo.

## 4. Decisiones estructurales

### 4.1 Versionado de evaluaciones

```
Assessment  (contenedor estable)
   └── AssessmentVersion  (inmutable una vez publicada)
          └── Question
                 ▲
                 │
   Assignment ───┘  (fija una versión concreta)
          └── AssignmentRecipient
                 └── AssessmentAttempt
                        └── AttemptAnswer
```

Editar una evaluación publicada no modifica la versión: crea la siguiente en estado `DRAFT`. Los intentos apuntan a la versión con la que se realizaron, y el resultado guarda además la escala y el umbral de aprobación aplicados. Un profesor puede corregir una pregunta después de que ochenta estudiantes la hayan respondido sin que ninguno de esos resultados cambie de significado.

### 4.2 Un solo motor de evaluación

`AssessmentEngine` opera sobre `userId`, no sobre `studentId`. Los cuatro escenarios que la especificación describe son el mismo motor con parámetros distintos:

| Escenario | `audience` | `purpose` | Escala |
|---|---|---|---|
| Evaluación de estudiantes | `STUDENT` | `EVALUATION` | 1.0–6.0, aprueba con 70 % |
| Evaluación de docentes | `TEACHER` | `EVALUATION` | 0–100 %, aprueba con 80 % |
| Capacitación KMK | `TEACHER` | `TRAINING` | 0–100 % |
| Generada por IA | cualquiera | cualquiera | la de su audiencia |

No hay cuatro sistemas ni cuatro cálculos de estadística: hay uno.

### 4.3 Calificadores enchufables

Cada familia de tipo de pregunta tiene un calificador que implementa la misma interfaz:

```ts
interface Grader<T extends QuestionType> {
  readonly type: T;
  readonly requiresManualGrading: boolean;
  grade(payload: PayloadOf<T>, answer: AnswerOf<T>, points: number): GradeOutcome;
}
```

`GraderRegistry` los resuelve por tipo. Añadir un tipo de pregunta es añadir un esquema en `shared` y un calificador aquí: ninguna evaluación existente se ve afectada, porque las versiones publicadas son inmutables y siguen usando el calificador de su tipo.

### 4.4 Errores por código

El backend nunca produce el texto que lee el usuario. Emite:

```json
{ "success": false, "error": { "code": "ATTEMPT_LIMIT_REACHED", "message": "…", "details": { "allowed": 2 } } }
```

El frontend traduce `errors.ATTEMPT_LIMIT_REACHED` al idioma del usuario, interpolando `details`. Es la única forma de cumplir el requisito de que errores y validaciones estén en los tres idiomas sin duplicar catálogos de traducción en el servidor.

### 4.5 Autoridad del servidor sobre el tiempo

El temporizador del navegador es información, no autoridad. Al iniciar un intento el servidor calcula `deadlineAt` y lo persiste. Cada guardado de respuesta y el envío se comprueban contra ese instante, con un margen de gracia configurable para absorber la latencia del último segundo. Un intento vencido se cierra de forma perezosa al siguiente contacto y por barrido programado.

### 4.6 Desnormalización deliberada en `AttemptAnswer`

Al calificar se copian a la respuesta la competencia KMK, la materia, el grupo y el periodo. Es redundancia consciente: convierte cada estadística por competencia en un `GROUP BY` sobre una tabla indexada, en lugar de un recorrido `intento → versión → pregunta` que no aguantaría los 100.000 intentos del objetivo de escala. Los valores se fijan una vez y no se recalculan, lo que además los hace históricamente correctos aunque el estudiante cambie de grupo.

### 4.7 Integraciones externas aisladas

```
PhidiasClient      HTTP: reintentos, tiempo de espera, cortacircuitos, caché
     ▼
PhidiasService     dominio: métodos con significado, validación Zod, mappers
     ▼
PhidiasSyncService escritura: fetch → validar → normalizar → upsert → auditar
```

La misma forma se aplica al proveedor de IA (`AiProvider` con adaptadores). En ambos casos existe una implementación simulada seleccionable por variable de entorno, estrictamente separada de la real: nunca se mezclan datos ficticios con producción.

## 5. Convenciones de código

- **TypeScript estricto de verdad.** `any` está prohibido por ESLint. `noUncheckedIndexedAccess` activo: acceder a `array[0]` obliga a considerar `undefined`.
- **Nombres en inglés en el código, comentarios y textos de dominio en español.** El equipo trabaja en español; las bibliotecas, en inglés.
- **Los comentarios explican por qué, no qué.** Un comentario que parafrasea la línea siguiente es ruido.
- **Sin funciones gigantes ni componentes gigantes.** ESLint avisa a partir de 80 líneas por función y de 220 por plantilla Vue.
- **Un archivo, una responsabilidad.** Si un servicio necesita tres párrafos para explicarse, son tres servicios.

## 6. Pruebas

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitarias | Vitest | Lógica pura: escalas, calificadores, mappers, validadores |
| Integración | Vitest + Supertest + PostgreSQL de pruebas | Rutas completas contra base real, incluidas transacciones y permisos |
| Componentes | Vitest + Vue Test Utils | Componentes críticos: runner de evaluación, editor de preguntas |
| Extremo a extremo | Playwright | El recorrido completo del criterio de aceptación |

Los servicios externos (Phidias, IA) se simulan siempre: la suite no depende de la red ni consume cuota.

## 7. Rendimiento y escala

Objetivo: 500 docentes, 5.000 estudiantes, 100.000 intentos, sin rediseñar.

- Paginación obligatoria en todo listado; ningún endpoint devuelve una colección sin límite.
- Índices diseñados a partir de las consultas de los cuadros de mando, no genéricos.
- `totalPoints` y `questionCount` materializados al publicar, para no recalcularlos en cada listado.
- Caché con interfaz propia: memoria hoy, Redis cuando la carga lo justifique, sin tocar el código que la usa.
- Frontend con división de código por ruta y carga diferida de los módulos pesados (gráficos).

## 8. Qué no se hace

Decisiones explícitas de lo que la arquitectura descarta, para que no se reintroduzcan por costumbre:

- El navegador no habla con Phidias. Nunca. Ni siquiera a través de un proxy.
- El frontend no ejecuta SQL ni conoce el modelo de datos.
- Las reglas de calificación no viven en componentes Vue.
- La IA no publica: genera borradores que una persona revisa.
- Los datos personales que la plataforma no necesita no se copian: se descartan en el mapper de sincronización.
