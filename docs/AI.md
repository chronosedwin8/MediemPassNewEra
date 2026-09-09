# Generación asistida de evaluaciones

## La regla que ordena todo lo demás

**La IA nunca publica.** Todo lo que produce nace como versión en estado
`DRAFT`, exactamente igual que una evaluación escrita a mano, y llega a un
estudiante solo cuando un docente la ha leído y la ha publicado.

No es una precaución simbólica. Una pregunta generada puede ser gramaticalmente
impecable y pedagógicamente equivocada: atribuir la respuesta correcta a la
opción errónea, medir una competencia distinta de la que dice medir, o dar por
buena una respuesta que en el aula se ha enseñado de otra forma. Ninguna
validación automática detecta eso; un docente que lee las preguntas, sí. El
sistema está construido para que ese paso no se pueda saltar.

De ahí se sigue el resto del diseño: la generación es una **fuente de
borradores**, no un camino paralelo de publicación. No existe un flujo «rápido»
que evite la revisión, ni un permiso que lo habilite.

## El flujo completo

```
Docente → POST /api/ai/generate
            │
            ├─ ¿La función está activa?            → BAD_REQUEST
            ├─ ¿Cabe en el máximo configurado?     → VALIDATION_ERROR
            ├─ ¿Le queda cupo diario?              → AI_QUOTA_EXCEEDED
            │
            ├─ Se registra la solicitud (IN_PROGRESS)
            │
            ├─ Contexto desde la base de datos
            │    competencias KMK, materia, grado
            │
            ├─ Proveedor (Google Gemini | mock)
            │
            ├─ Capa 1 · forma      JSON.parse + Zod    → REJECTED
            ├─ Capa 2 · sentido    reglas por tipo     → REJECTED
            │
            ├─ Se materializa el borrador (DRAFT)
            └─ APPLIED + registro de auditoría
```

Cada estado terminal queda escrito en `ai_generation_requests`. Una solicitud
nunca desaparece: o se aplicó, o se rechazó con sus motivos, o falló con su
mensaje de error.

## Las dos capas de validación

Que el modelo devuelva JSON bien formado no dice nada sobre si las preguntas
sirven. Por eso hay dos filtros, y son distintos en naturaleza.

### Capa 1 · Forma

`JSON.parse` seguido de un esquema Zod. Responde a «¿esto tiene la estructura
que espero?»: los campos obligatorios están, los tipos son los correctos, el
tipo de pregunta es uno de los admitidos.

Se usa además el modo de **salida estructurada** de Gemini, pasándole el esquema
de respuesta. Eso reduce mucho los fallos de forma, pero no los elimina, y la
validación se hace igual: la garantía del proveedor no es una garantía nuestra.

### Capa 2 · Sentido

Reglas por tipo de pregunta, en `SEMANTIC_RULES`. Responde a «¿esto es una
pregunta utilizable?»:

| Tipo              | Lo que se exige                                                   |
| ----------------- | ----------------------------------------------------------------- |
| `SINGLE_CHOICE`   | Al menos dos opciones y **exactamente una** correcta              |
| `MULTIPLE_CHOICE` | Al menos tres opciones, alguna correcta y **no todas** correctas  |
| `TRUE_FALSE`      | La respuesta indicada                                             |
| `SHORT_ANSWER`    | Al menos una respuesta admitida                                   |
| `ORDERING`        | Al menos tres elementos                                           |
| `OPEN_TEXT`       | Retroalimentación que oriente (no una fórmula de diez caracteres) |

Y, para todos, que la competencia KMK citada exista realmente en el marco.

`SEMANTIC_RULES` es un **registro indexado por tipo**, no una cadena de `case`.
La diferencia importa: si mañana la IA aprende a generar un tipo nuevo, olvidar
su regla es un error de compilación, no una pregunta sin revisar que se cuela en
el borrador.

Las reglas devuelven **todos** los problemas encontrados, no el primero. Quien
mira un rechazo quiere saber si falló una pregunta o el lote entero.

## Qué tipos se pueden generar, y por qué no todos

`AI_SUPPORTED_TYPES` cubre seis de los trece tipos del sistema:

```
SINGLE_CHOICE · MULTIPLE_CHOICE · TRUE_FALSE · SHORT_ANSWER · OPEN_TEXT · ORDERING
```

Los otros siete quedan fuera por una razón concreta, no por falta de tiempo: un
modelo de texto no puede inventar las coordenadas de un `HOTSPOT` sobre una
imagen que no ha visto, ni emparejar elementos de un `MATCHING` con sentido si
las columnas dependen de material que el docente aún no ha subido. Ofrecer esos
tipos produciría preguntas que hay que rehacer enteras, que es peor que no
ofrecerlos.

El formulario consulta `GET /api/ai/capabilities` y muestra únicamente lo que la
instalación sabe generar. La lista no está duplicada en el frontend.

## El rechazo se guarda

Cuando una respuesta no pasa la validación, `rejectRequest` deja constancia:

- estado `REJECTED`,
- la respuesta cruda (recortada a 20 000 caracteres),
- la lista completa de problemas en `validationErrors`.

No se crea nada más: ni evaluación, ni versión, ni preguntas.

Conservar la respuesta fallida es deliberado. Es lo que permite mejorar el
prompt mirando qué produjo el modelo, en lugar de adivinar. Un rechazo del que
no queda rastro es un rechazo que se repetirá.

Por el mismo motivo, el `catch` general cierra la solicitud como `FAILED`
**solo si sigue en `IN_PROGRESS`** (`updateMany` con el estado en el filtro).
Marcar como fallida una solicitud ya rechazada borraría justamente la
información que explica por qué se descartó.

## Límites

Tres, y cada uno protege algo distinto:

| Límite                            | Dónde se define                  | De qué protege                        |
| --------------------------------- | -------------------------------- | ------------------------------------- |
| Función activa                    | Ajuste `AI_ENABLED` en base      | Poder apagarla sin desplegar          |
| Máximo de preguntas por solicitud | Ajuste `AI_MAX_QUESTIONS`        | Respuestas enormes y caras            |
| Cupo diario por usuario           | `AI_RATE_LIMIT_PER_USER_PER_DAY` | Que una cuenta consuma el presupuesto |

Los dos primeros son **ajustes en base de datos**, editables por un
administrador. El tercero es de entorno.

Se comprueban **antes** de llamar al proveedor: cada llamada se cobra, y no
tiene sentido pagar por una petición que se va a rechazar después.

Además, `aiRateLimit` limita la frecuencia a nivel de ruta. El cupo diario mide
consumo; el limitador de ruta mide ráfagas.

## Proveedores

`AiProvider` es una interfaz con dos implementaciones:

- **`GoogleAiProvider`** — Gemini vía `fetch`, con salida estructurada y tiempo
  máximo configurable. La clave viaja en la cabecera `x-goog-api-key`, **nunca**
  en la URL: en la URL acabaría en los registros de cualquier proxy intermedio.
  Ante un error del proveedor se registra el código de estado, no el cuerpo, que
  puede reflejar la clave enviada.
- **`MockAiProvider`** — respuestas fijas y verosímiles. Es el proveedor por
  defecto (`AI_PROVIDER=mock`) y el que usan las pruebas: la suite de
  integración no depende de la red, ni de una clave, ni de que el modelo
  devuelva hoy lo mismo que ayer.

Añadir otro proveedor es implementar la interfaz. Nada fuera de `ai.provider.ts`
sabe qué modelo hay detrás.

## Configuración

```bash
AI_PROVIDER=mock              # google | mock
AI_API_KEY=                   # requerida solo con google
AI_MODEL=gemini-2.5-pro
AI_TIMEOUT_MS=120000          # generar 30 preguntas lleva su tiempo
AI_MAX_QUESTIONS_PER_REQUEST=30
AI_RATE_LIMIT_PER_USER_PER_DAY=50
```

Sin `AI_API_KEY`, `GoogleAiProvider.isConfigured()` devuelve `false` y
`/capabilities` lo anuncia, de modo que el formulario puede explicar por qué la
función no está disponible en lugar de fallar al enviar.

## API

| Método | Ruta                   | Permiso       | Devuelve                                     |
| ------ | ---------------------- | ------------- | -------------------------------------------- |
| `GET`  | `/api/ai/capabilities` | `AI_GENERATE` | Proveedor, modelo, tipos admitidos y límites |
| `POST` | `/api/ai/generate`     | `AI_GENERATE` | Borrador creado, o `AI_RESPONSE_INVALID`     |
| `GET`  | `/api/ai/requests`     | `AI_GENERATE` | Historial de solicitudes del docente         |

Códigos de error propios: `AI_PROVIDER_ERROR`, `AI_RESPONSE_INVALID`,
`AI_QUOTA_EXCEEDED`, `EXTERNAL_SERVICE_TIMEOUT`.

## Auditoría

Una generación aplicada escribe una entrada `GENERATE_AI_ASSESSMENT` con el
proveedor, el modelo, el número de preguntas y el tema. Un borrador de origen
automático es identificable después, que es lo que permite responder a «¿esta
evaluación la escribió alguien o la generó el sistema?» meses más tarde.

## Lo que la IA no hace

- No publica.
- No califica respuestas de estudiantes.
- No modifica evaluaciones existentes: siempre crea un borrador nuevo.
- No ve datos personales de estudiantes. El contexto que recibe son
  competencias KMK, materia, grado y tema; nada más.

Ese último punto conviene subrayarlo: en ninguna solicitud al proveedor viaja el
nombre, el documento, el correo ni el resultado de ningún estudiante.
