# PHIDIAS.md

Integración con Phidias, la fuente oficial de estudiantes.

Contratos verificados contra el entorno real `ds-barranquilla` el **8 de septiembre de 2026**. Nada de lo que aparece aquí está supuesto: lo que no se pudo comprobar está marcado como tal.

---

## 1. Principio de diseño

```
Phidias → Backend → Validación → Normalización → PostgreSQL → API propia → Vue
```

**Nunca** `Vue → Phidias`. El token de Phidias no sale del backend: no viaja al navegador, no aparece en respuestas de la API, no se escribe en registros y no atraviesa proxies de terceros.

> **Antecedente relevante.** El prototipo anterior (`PhidiasC`) incrustaba el token en JavaScript de navegador y, cuando el navegador bloqueaba CORS, reenviaba la petición completa a través de `corsproxy.io` y `api.allorigins.win`. Esos proxies públicos vieron la cabecera `Authorization` íntegra, y el token quedó además en los _bundles_ de `dist/` desplegados. El JWT en cuestión (`sub: 3165`, `restapi_access`, `exp` en enero de 2031) **debe considerarse comprometido y conviene solicitar su rotación**. La arquitectura de esta plataforma elimina la causa: el navegador nunca habla con Phidias.

## 2. Configuración

```bash
PHIDIAS_BASE_URL=https://ds-barranquilla.phidias.co/rest
PHIDIAS_TOKEN=              # JWT. Solo en .env, jamás en el repositorio
PHIDIAS_MODE=mock           # live | mock
PHIDIAS_TIMEOUT_MS=30000
PHIDIAS_RETRIES=2
PHIDIAS_CACHE_TTL_SECONDS=300
PHIDIAS_ACADEMIC_YEAR_ID=6  # anulación manual; normalmente se resuelve solo
```

## 3. Peculiaridades de la API que conviene conocer

Estas son las que cuestan tiempo si se descubren sobre la marcha.

### 3.1 `year` no es el año calendario

Es un **identificador interno** de Phidias. La documentación que circula dice «año académico (ej: 2026)» y es incorrecto: pedir `subjects?year=2026` devuelve una lista vacía.

| `year` | Curso real                        |
| ------ | --------------------------------- |
| 1      | 2021-2022                         |
| 2      | 2022-2023                         |
| 3      | 2023-2024                         |
| 4      | 2024-2025                         |
| 5      | 2025-2026                         |
| **6**  | **2026-2027 (vigente)**           |
| 7      | 2027-2028 (ya creado, casi vacío) |

Por eso `resolveCurrentAcademicYear()` **no** confía en una constante: agrupa los periodos por `year`, calcula el rango de fechas de cada grupo y elige el que contiene la fecha de hoy. Fijar el año a mano significaría que el sistema deja de funcionar cada mes de agosto. La variable de entorno queda solo como anulación de emergencia.

### 3.2 Las respuestas no tienen una forma común

| Endpoint                | Forma                       |
| ----------------------- | --------------------------- |
| `/1/academic/areas`     | Array plano                 |
| `/1/academic/subjects`  | `{ response: [...] }`       |
| `/1/academic/periods`   | `{ response: [...] }`       |
| `/1/course/consolidate` | Array plano (árbol anidado) |

Además, las claves de `subjects` **llevan espacios**: `"id subject"`, `"subject en"`, `"id area"`.

### 3.3 Las fechas son marcas Unix en segundos

`start_date: 1785531600`. No hay ISO-8601 en ningún campo.

### 3.4 Los tipos de un mismo campo varían

Comprobado sobre los 1.177 estudiantes matriculados:

| Campo      | Tipos observados                        |
| ---------- | --------------------------------------- |
| `username` | cadena (1.087) · **número (90)**        |
| `code`     | número (1.139) · nulo (36) · cadena (2) |
| `email`    | cadena (1.166) · nulo (11)              |

Noventa estudiantes tienen su código numérico como nombre de usuario. Un esquema que exija `string` rompe la sincronización entera por ello, así que los esquemas aceptan la unión y el mapper normaliza.

### 3.5 Los identificadores de estructura se reasignan cada curso

Los niveles pasaron de `14/15/16` (curso 2025-26) a `17/18/19` (curso 2026-27). Lo mismo ocurre con grados y secciones.

En consecuencia:

- `groups` lleva unicidad `(external_source, external_id, academic_year_id)`.
- Los grados de la plataforma son **propios y estables**; el emparejamiento con Phidias se hace **por nombre** (`KLASSE 8` → `K8`).
- `students.external_id` **sí** es estable entre cursos, y su unicidad es `(external_source, external_id)`.

### 3.6 Los estados de matrícula son texto libre

Valores observados en el curso vigente: `activo` (1.105), `inscrito` (40), `retirado` (14), `pendiente` (13), `Admitido` (5).

`Admitido` —con mayúscula inicial— no existía en la extracción del curso anterior. Por eso el mapeo es tolerante: un valor desconocido cae en `UNKNOWN`, se registra una sola vez y **no** interrumpe la carga. Detener la sincronización de 1.177 estudiantes porque uno tiene un estado nuevo sería desproporcionado.

### 3.7 Coexisten varias familias de periodos

En el curso vigente hay cinco periodos activos simultáneamente, de categorías distintas (académica regular, extracurricular, y otras). El endpoint que da nombre a esas categorías (`/1/academic/period_categories`) **devuelve HTTP 500**, así que no se pueden resolver automáticamente. El administrador designa cuál es la oficial mediante la clave de configuración `phidias.official_period_category`.

## 4. Estado real de los endpoints

| Endpoint                                      | Estado       | Notas                                                                 |
| --------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| `GET /1/academic/areas`                       | ✅ 200       | 262 filas para todos los años; hay que filtrar por `year`             |
| `GET /1/academic/subjects?year=N`             | ✅ 200       | 124 materias en `year=6`                                              |
| `GET /1/academic/periods`                     | ✅ 200       | 72 periodos, años 1 a 7                                               |
| `GET /1/course/consolidate`                   | ✅ 200       | ~2 MB, 3 niveles / 15 grados / 52 secciones / 1.177 estudiantes; ~7 s |
| `GET /1/academic/course_group`                | ❌ 500       | Roto en el servidor                                                   |
| `GET /1/academic/period_categories`           | ❌ 500       | Roto en el servidor                                                   |
| `GET /1/academic/grading2/ranking`            | ❌ 401       | El token carece de permisos                                           |
| `GET /1/academic/student/report/...`          | ❌ 401       | El token carece de permisos                                           |
| `GET /1/academic/grading/evaluation`          | ❌ 401       | El token carece de permisos                                           |
| `GET /1/academic/grading/areas` \| `/courses` | ⚠️ 200 vacío | Sin calificaciones publicadas                                         |
| `GET /1/attendance/...`                       | ⚠️ 200 vacío | Restringido por usuario                                               |

Los endpoints de calificación no son críticos: la plataforma genera sus propias notas. Se declaran en `PhidiasService.getStatus().knownBrokenEndpoints` para que la interfaz de administración pueda explicarlo en lugar de mostrar un error genérico.

## 5. Arquitectura de la integración

```
PhidiasClient          red: tiempo de espera, reintentos, cortacircuitos,
                       caché de 5 min, traducción de HTTP a códigos propios
      ▼
PhidiasService         dominio: métodos con significado, validación Zod
  ├── LivePhidiasService     API real
  └── MockPhidiasService     fixtures anonimizados
      ▼
PhidiasSyncService     escritura: obtener → validar → normalizar →
                       insertar/actualizar → auditar
```

`LivePhidiasService` y `MockPhidiasService` son **clases distintas**, no un interruptor dentro de la misma. El modo se decide una vez al arrancar, de modo que los datos de prueba no pueden mezclarse con producción ni por accidente.

### Manejo de fallos

| Situación                           | Respuesta                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 401 / 403                           | `PHIDIAS_UNAUTHORIZED` (502). No se reintenta: insistir no arregla un token caducado                                  |
| 404                                 | `EXTERNAL_SERVICE_ERROR` (502)                                                                                        |
| 429                                 | `RATE_LIMIT_EXCEEDED`, con reintento y retroceso exponencial                                                          |
| 5xx                                 | `EXTERNAL_SERVICE_UNAVAILABLE`, con reintento                                                                         |
| Tiempo agotado                      | `EXTERNAL_SERVICE_TIMEOUT` (504)                                                                                      |
| 5 fallos seguidos                   | Cortacircuitos abierto 60 s: las llamadas fallan al instante en lugar de dejar esperando al usuario 30 s por petición |
| Respuesta que no cumple el contrato | `EXTERNAL_SERVICE_ERROR` con las cinco primeras discrepancias, para poder diagnosticar                                |

## 6. Minimización de datos

El objeto de estudiante que devuelve `consolidate` trae **más de sesenta campos**, entre ellos `document`, `document_location`, `address`, `address_encoded`, `phone`, `mobile`, `birthday`, `birthplace`, `nationality`, `blood`, `rfc` y un campo `password`.

La plataforma declara en su esquema **ocho**:

```
id · firstname · lastname · username · email · code · language · enrollment.status
```

Lo que no se declara no se lee, y lo que no se lee no puede filtrarse por descuido a un registro ni a una respuesta. El registrador aplica además una lista de redacción sobre esos mismos nombres de campo, por si alguna vez alguien los pasa por error.

## 7. Sincronización

```
POST /api/integrations/phidias/sync/students     { "dryRun": false }
```

Requiere el permiso `phidias:sync`. Devuelve un informe completo:

```json
{
  "status": "SUCCESS",
  "academicYearExternalId": 6,
  "sectionsProcessed": 52,
  "studentsCreated": 1177,
  "studentsUpdated": 0,
  "studentsDeactivated": 0,
  "groupsCreated": 52,
  "membershipsAdded": 1177,
  "issues": [],
  "durationMs": 6909
}
```

### Garantías

- **No borra a nadie.** Quien desaparece de la respuesta pasa a `WITHDRAWN`. Su historial académico sobrevive y puede reincorporarse el curso siguiente. Un fallo puntual de Phidias no puede llevarse por delante media matrícula.
- **Idempotente.** Verificado: la segunda ejecución sobre los mismos datos produce `0 creados · 1.177 actualizados · 0 grupos nuevos · 0 inscripciones nuevas`.
- **Tolerante por registro.** Un correo repetido —los hay en la matrícula real— o un nombre de usuario ocupado se resuelven y se anotan como incidencia; el resto continúa. El estado pasa a `PARTIAL`, nunca a `FAILED`.
- **Auditada.** Cada ejecución deja una fila en `phidias_sync_logs` con sus contadores y hasta cien incidencias, más una entrada de auditoría.

### Otros endpoints

| Método | Ruta                                         | Para qué                                                                             |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/api/integrations/phidias/status`           | Modo, si hay token configurado, estado del cortacircuitos, endpoints rotos conocidos |
| `GET`  | `/api/integrations/phidias/academic-year`    | Año vigente resuelto por fecha                                                       |
| `GET`  | `/api/integrations/phidias/catalog`          | Áreas, materias y periodos **tal cual**, para que el administrador elija qué crear   |
| `GET`  | `/api/integrations/phidias/preview/students` | Vista previa sin escribir nada                                                       |
| `GET`  | `/api/integrations/phidias/sync/logs`        | Historial                                                                            |

Las áreas y materias **no se crean solas**. De las 262 «áreas» que devuelve Phidias, muchas son propósitos pedagógicos de preescolar o rúbricas de comportamiento; agregarlas sin criterio produciría estadísticas sin sentido. El catálogo se expone para que una persona decida.

## 8. Fixtures del modo simulado

```bash
PHIDIAS_MODE=live npm run phidias:fixtures
```

Descarga la estructura real y produce fixtures que conservan **la forma y las proporciones** —jerarquía, número de secciones, tamaño de los grupos, reparto de estados, porcentaje sin correo y con correo personal, nombres de usuario numéricos— pero sustituyen nombres, correos e identificadores.

Así el modo simulado ejercita los mismos casos límite que la API real sin que la matrícula del colegio acabe en un repositorio. Los fixtures viven en `backend/src/infrastructure/external/phidias/fixtures/` y sí se versionan, porque ya no contienen datos personales.

## 9. Verificar los contratos tras un cambio

```bash
npm run phidias:probe
```

Consulta cada endpoint, informa del estado, el tamaño y la forma de la respuesta, y señala las discrepancias con los esquemas. Es lo primero que hay que ejecutar si la sincronización empieza a fallar sin que nada haya cambiado de este lado.
