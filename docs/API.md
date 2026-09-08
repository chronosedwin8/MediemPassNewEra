# API.md

Contrato de la API REST de Medienpass.

Base: `/api` · Formato: JSON · Autenticación: JWT (cabecera `Authorization: Bearer`) con refresco por cookie.

---

## 1. Formato de respuesta

Toda respuesta usa la misma envoltura, sin excepciones.

**Éxito**

```json
{ "success": true, "data": { } }
```

**Éxito paginado**

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "pageSize": 20, "total": 137, "totalPages": 7 }
}
```

**Error**

```json
{
  "success": false,
  "error": {
    "code": "ATTEMPT_LIMIT_REACHED",
    "message": "Attempt limit reached for this assignment",
    "details": { "allowed": 2, "used": 2 },
    "requestId": "01JQ8…"
  }
}
```

El `message` es diagnóstico, en inglés, y **no** debe mostrarse al usuario: el cliente traduce `error.code` a través de `errors.<CODE>` en su catálogo i18n, interpolando `details`. Esta es la única forma de que errores y validaciones estén realmente en español, alemán e inglés sin duplicar traducciones en el servidor.

En errores de validación se añade `issues`:

```json
{
  "code": "VALIDATION_ERROR",
  "issues": [{ "path": "questions.2.points", "rule": "too_small", "message": "…" }]
}
```

El catálogo completo de códigos está en [`packages/shared/src/errors.ts`](../packages/shared/src/errors.ts).

## 2. Estados HTTP

| Estado | Cuándo |
|---|---|
| 200 | Consulta o actualización correcta |
| 201 | Recurso creado |
| 204 | Eliminado, sin cuerpo |
| 400 | Petición malformada |
| 401 | Sin autenticar, token inválido o expirado |
| 403 | Autenticado pero sin permiso, o fuera de su alcance |
| 404 | No existe, o existe pero el usuario no puede saberlo |
| 409 | Conflicto de estado (versión publicada, intento ya enviado) |
| 422 | Validación o regla de dominio incumplida |
| 429 | Límite de peticiones superado |
| 500 | Fallo interno |
| 502 / 503 / 504 | Fallo, indisponibilidad o tiempo de espera de un servicio externo |

## 3. Convenciones

**Paginación y orden.** Todo listado acepta `?page=1&pageSize=20&sort=createdAt&order=desc`. `pageSize` máximo 100. Ningún endpoint devuelve una colección sin límite.

**Filtros.** Los nombres de filtro son estables en toda la API: `academicYearId`, `periodId`, `areaId`, `subjectId`, `teacherId`, `gradeLevelId`, `groupId`, `competencyId`, `search`. Los resuelve un único constructor de filtros, para que dos cuadros de mando con los mismos filtros no puedan dar cifras distintas.

**Idempotencia.** El guardado de respuestas (`PUT`) es idempotente: reenviar la misma respuesta no altera el estado ni consume intentos.

**Alcance.** El permiso concede la capacidad; el alcance decide sobre qué filas. Un docente con `assessment:update` solo edita las suyas; con `result:read_scoped` solo ve resultados de sus grupos. Violar el alcance devuelve 403 con `NOT_RESOURCE_OWNER` o `OUT_OF_SCOPE`.

## 4. Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/auth/login` | Credenciales locales. Devuelve token de acceso y fija la cookie de refresco. |
| `POST` | `/api/auth/refresh` | Rota el refresco y emite un acceso nuevo. Requiere cabecera CSRF. |
| `POST` | `/api/auth/logout` | Revoca la cadena de refresco. |
| `GET` | `/api/auth/me` | Usuario actual, roles y permisos efectivos. |
| `POST` | `/api/auth/change-password` | Cambio de contraseña propia. |
| `GET` | `/api/auth/sso/entra/start` | Inicia el flujo OIDC con Microsoft Entra ID. |
| `GET` | `/api/auth/sso/entra/callback` | Retorno del proveedor. |

El token de acceso vive 15 minutos y viaja en la cabecera. El refresco es rotativo, se guarda solo su hash y viaja en una cookie `httpOnly`, `SameSite=Strict`, `Secure` en producción. Reutilizar un refresco ya rotado revoca la cadena completa: es la señal de que alguien lo robó.

## 5. Superficie por módulo

Salvo indicación contraria, cada recurso ofrece `GET /` (listado paginado), `POST /` (crear), `GET /:id`, `PATCH /:id` y `DELETE /:id` (lógico).

| Prefijo | Recurso | Notas |
|---|---|---|
| `/api/users` | Usuarios | `POST /:id/roles`, `POST /:id/reset-password` |
| `/api/teachers` | Docentes | `PUT /:id/areas`, `PUT /:id/subjects` |
| `/api/students` | Estudiantes | Solo lectura y edición; el alta masiva llega por sincronización |
| `/api/groups` | Grupos | `POST /:id/members`, `DELETE /:id/members/:studentId` |
| `/api/areas`, `/api/subjects` | Estructura | Curados por administración |
| `/api/academic/years`, `/api/academic/periods` | Calendario | |
| `/api/kmk/competencies` | Competencias | Incluye subcompetencias e indicadores anidados |
| `/api/assessments` | Evaluaciones | Ver detalle abajo |
| `/api/assignments` | Asignaciones | `GET /:id/recipients` para el seguimiento |
| `/api/attempts` | Intentos | Ver detalle abajo |
| `/api/evaluation-plans` | Planes | `POST /:id/duplicate`, `GET /:id/compliance` |
| `/api/training` | Capacitación | `modules`, `modules/:id/progress` |
| `/api/statistics` | Estadísticas | `overview`, `kmk`, `students/:id`, `teachers/:id`, `groups/:id` |
| `/api/ai` | IA | `POST /generate`, `GET /requests`, `GET /requests/:id` |
| `/api/settings` | Configuración | `GET /`, `PATCH /`; escalas en `/api/settings/scales` |
| `/api/audit` | Auditoría | Solo lectura, solo administración |
| `/api/integrations/phidias` | Phidias | Ver detalle abajo |

### 5.1 Evaluaciones y versiones

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/assessments` | Crea la evaluación y su versión 1 en `DRAFT` |
| `GET` | `/api/assessments/:id/versions` | Historial de versiones |
| `POST` | `/api/assessments/:id/versions` | Nueva versión `DRAFT` a partir de la última |
| `PATCH` | `/api/assessments/:id/versions/:versionId` | Solo si está en `DRAFT`; si no, `409 VERSION_IMMUTABLE` |
| `POST` | `/api/assessments/:id/versions/:versionId/publish` | Congela la versión y materializa puntos y número de preguntas |
| `POST` | `/api/assessments/:id/duplicate` | Copia completa como evaluación nueva |
| `GET`/`POST` | `…/versions/:versionId/questions` | Preguntas de una versión en borrador |
| `PATCH`/`DELETE` | `…/questions/:questionId` | |
| `PUT` | `…/questions/reorder` | Reordena en una sola operación |

Publicar exige al menos una pregunta (`ASSESSMENT_HAS_NO_QUESTIONS`) y que cada pregunta tenga competencia KMK (`KMK_COMPETENCY_REQUIRED`).

### 5.2 Realización de una evaluación

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/attempts/assigned` | Evaluaciones asignadas al usuario actual, con su estado |
| `POST` | `/api/attempts` | Inicia un intento. El servidor calcula y persiste `deadlineAt` |
| `GET` | `/api/attempts/:id` | Estado del intento y preguntas **sin** respuestas correctas |
| `PUT` | `/api/attempts/:id/answers/:questionId` | Guarda una respuesta. Idempotente. Es el autoguardado |
| `POST` | `/api/attempts/:id/submit` | Finaliza, califica y devuelve el resultado |
| `GET` | `/api/attempts/:id/result` | Resultado, según la configuración de visibilidad de la versión |
| `POST` | `/api/attempts/:id/answers/:questionId/grade` | Calificación manual por el docente |

`GET /api/attempts/:id` **nunca** incluye qué opción es correcta mientras el intento está en curso: el payload se poda en el servidor antes de responder. Enviarlo y ocultarlo en el cliente sería regalar las respuestas a cualquiera que abra las herramientas de desarrollo.

Guardar o enviar fuera de plazo devuelve `409 TIME_LIMIT_EXCEEDED`, salvo dentro del margen de gracia configurable.

### 5.3 Phidias

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/integrations/phidias/status` | Modo, disponibilidad y estado del cortacircuitos |
| `GET` | `/api/integrations/phidias/preview/students` | Vista previa sin escribir en la base |
| `POST` | `/api/integrations/phidias/sync/students` | Sincroniza. Devuelve creados, actualizados, desactivados e incidencias |
| `GET` | `/api/integrations/phidias/sync/logs` | Historial de sincronizaciones |

El token de Phidias no aparece en ninguna respuesta, en ningún registro ni en ninguna cabecera devuelta al cliente.

### 5.4 Estadísticas

`GET /api/statistics/kmk` acepta el conjunto completo de filtros y devuelve, por competencia: promedio, número de preguntas respondidas, porcentaje de acierto, nivel alcanzado y serie temporal. Los cuadros de mando de administrador, docente y estudiante consumen este mismo servicio con distinto alcance.

## 6. Seguridad de transporte

- CORS con lista blanca explícita; nunca `*` junto a credenciales.
- Helmet con política de seguridad de contenido.
- Límite de peticiones global y otro más estricto en autenticación (`RATE_LIMIT_AUTH_MAX`) y en generación con IA.
- Doble envío de token CSRF en las rutas que dependen de la cookie de refresco.
- Todo cuerpo, parámetro y consulta se valida con Zod antes de llegar al controlador.

## 7. Versionado de la API

La API no lleva prefijo de versión todavía: cliente y servidor se despliegan juntos. Cuando exista un consumidor externo, se introducirá `/api/v1` manteniendo `/api` como alias de la versión vigente.
