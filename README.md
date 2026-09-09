# Medienpass

Plataforma web de evaluación académica y desarrollo de competencias digitales **KMK** para el Colegio Alemán de Barranquilla.

Permite a los administradores gobernar la estructura académica, a los docentes crear y asignar evaluaciones asociadas a competencias digitales, y a los estudiantes resolverlas obteniendo resultados en la escala alemana 1.0–6.0, con estadísticas por competencia, capacitación docente y generación asistida por IA.

> **Estado:** en desarrollo. Consulta [`ROADMAP.md`](ROADMAP.md) para el plan por etapas y [`PROJECT_ANALYSIS.md`](PROJECT_ANALYSIS.md) para el análisis técnico y las decisiones de arquitectura.

---

## Arquitectura

```
frontend/          Vue 3 · TypeScript · Vite · Pinia · Tailwind · vue-i18n
    │  HTTP (cliente único tipado)
    ▼
backend/           Node · Express · TypeScript
    routes → middleware (auth · RBAC · validación · rate limit)
           → controllers → services → repositories
    ▼
PostgreSQL 17      Prisma · migraciones versionadas

packages/shared/   Tipos, esquemas Zod, códigos de error y reglas de
                   calificación compartidos por backend y frontend
```

Principios que el código respeta de forma innegociable:

- **El navegador nunca habla con Phidias ni con PostgreSQL.** Toda integración externa vive en el backend; el token de Phidias no sale de ahí.
- **Las evaluaciones se versionan.** `Evaluación → Versión → Preguntas → Intento → Respuestas`. Una versión publicada es inmutable, de modo que editar una evaluación jamás altera resultados ya emitidos.
- **Un solo motor de evaluación** sirve a estudiantes, docentes, capacitación KMK y contenido generado por IA.
- **Las reglas de negocio no viven en componentes Vue.** Escalas, umbrales de aprobación y puntuación son configuración y código compartido, no interfaz.

## Requisitos

| Software | Versión |
|---|---|
| Node.js | ≥ 20.11 (probado con 24.14) |
| npm | ≥ 10 (probado con 11.9) |
| PostgreSQL | 17 |

Alternativamente, `docker compose` levanta PostgreSQL sin instalarlo.

## Instalación

```bash
git clone https://github.com/chronosedwin8/MediemPassNewEra.git
cd MediemPassNewEra
npm install
```

### 1. Variables de entorno

```bash
cp .env.example .env
```

Rellena el `.env`. Como mínimo necesitas `DATABASE_URL` y los tres secretos de sesión, que puedes generar con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

El archivo [`.env.example`](.env.example) documenta cada variable. **Nunca** se versiona un `.env` real: está en `.gitignore` y así debe permanecer.

### 2. Base de datos

```bash
npm run db:migrate     # aplica las migraciones
npm run db:seed        # roles, permisos, competencias KMK, escalas y datos de demostración
```

### 3. Desarrollo

```bash
npm run dev            # backend (http://localhost:3000) y frontend (http://localhost:5173)
```

### Cuentas de demostración

Tras `npm run db:seed`, la contraseña de todas ellas es `Medienpass2026!`:

| Usuario | Rol |
|---|---|
| `admin` | Administrador |
| `stefan.brandt`, `laura.medina`, `carolina.pardo` | Docentes |
| `sofia.restrepo0` … `santiago.cabrera29` | Estudiantes |

Los estudiantes que llegan por sincronización con Phidias **no** tienen contraseña: nacen pendientes de activación, tal como se describe en [`docs/PHIDIAS.md`](docs/PHIDIAS.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta backend y frontend con recarga en caliente |
| `npm run build` | Compila todos los paquetes para producción |
| `npm run typecheck` | Comprueba tipos en todos los paquetes (modo estricto) |
| `npm run lint` | ESLint sobre el monorepo |
| `npm run format` | Formatea con Prettier |
| `npm test` | Pruebas unitarias y de integración |
| `npm run test:e2e` | Pruebas de extremo a extremo (Playwright) |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:reset` | Recrea la base desde cero y siembra |
| `npm run db:studio` | Explorador visual de datos (Prisma Studio) |
| `npm run phidias:probe` | Contrasta los contratos reales de la API de Phidias |

## Integración con Phidias

Phidias es la fuente oficial de estudiantes. La sincronización es unidireccional y tolerante a fallos:

```
Phidias → Backend → Validación → Normalización → PostgreSQL → API propia → Vue
```

Detalles operativos, contratos verificados y peculiaridades de la API (entre ellas que `year` es un identificador interno y **no** el año calendario) están documentados en [`docs/PHIDIAS.md`](docs/PHIDIAS.md).

`PHIDIAS_MODE=mock` usa fixtures anonimizados y permite desarrollar y ejecutar la suite completa sin tocar la API real ni datos personales.

## Documentación

| Documento | Contenido |
|---|---|
| [`ROADMAP.md`](ROADMAP.md) | Plan de implementación por etapas |
| [`PROJECT_ANALYSIS.md`](PROJECT_ANALYSIS.md) | Análisis del entorno, riesgos y decisiones |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Capas, módulos y convenciones |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Modelo de datos, índices y versionado |
| [`docs/API.md`](docs/API.md) | Contrato REST y códigos de error |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Autenticación, RBAC y tratamiento de datos personales |
| [`docs/PHIDIAS.md`](docs/PHIDIAS.md) | Integración y sincronización |
| [`docs/AI.md`](docs/AI.md) | Generación asistida de evaluaciones |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Despliegue |

## Licencia

Software privado. Todos los derechos reservados.
