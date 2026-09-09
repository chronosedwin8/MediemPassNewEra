# Despliegue

## Lo que se despliega

Tres contenedores y un volumen:

```
              :8080
                │
          ┌─────▼─────┐        ┌───────────┐        ┌────────────┐
          │    web    │  /api  │  backend  │        │  postgres  │
          │  (nginx)  ├───────►│  (node)   ├───────►│    (17)    │
          └───────────┘        └───────────┘        └─────┬──────┘
                                                          │
                                                    postgres-data
```

Solo `web` publica un puerto. El backend y la base **no son alcanzables desde
fuera** de la red del compose: a la API se llega por nginx y a la base solo
desde dentro. Eso no es un detalle de comodidad, es la superficie de ataque: un
PostgreSQL con el puerto 5432 publicado recibe intentos de acceso a los pocos
minutos de estar en internet.

Que el frontend y la API compartan origen también es deliberado: permite que la
cookie de refresco sea `SameSite=Strict` sin excepciones y evita CORS con
credenciales en producción.

## Requisitos

- Docker Engine 24 o superior con el plugin `compose`
- 2 GB de RAM libres y 10 GB de disco para empezar
- Un certificado TLS y un proxy que lo termine (ver más abajo)

## Puesta en marcha

### 1 · Configuración

```bash
cp .env.example .env
```

Y generar los secretos. Cada uno debe ser **distinto**:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Hacen falta tres: `JWT_SECRET`, `REFRESH_TOKEN_SECRET` y `COOKIE_SECRET`. Que
sean distintos importa: reutilizar el mismo valor haría que un token válido para
una cosa lo fuera para otra.

Los valores mínimos que hay que revisar antes de arrancar:

| Variable                              | Qué poner                                       |
| ------------------------------------- | ----------------------------------------------- |
| `APP_URL`                             | La URL pública real, con `https://`             |
| `CORS_ORIGIN`                         | La misma URL. Nunca `*`                         |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Credenciales de la base; el compose arma la URL |
| `JWT_SECRET` y los otros dos          | Generados como arriba                           |
| `PHIDIAS_MODE`                        | `mock` hasta tener el token rotado              |
| `AI_PROVIDER`                         | `mock` hasta tener clave de Google              |

El servidor **no arranca** si falta algo obligatorio, y dice exactamente qué:
la validación de entorno se hace con Zod al inicio, no al primer uso.

### 2 · Arranque

```bash
docker compose -f docker/docker-compose.yml --env-file .env up -d --build
```

El backend aplica las migraciones pendientes al arrancar (`prisma migrate
deploy`) y solo entonces acepta tráfico. `migrate deploy` únicamente aplica lo
que falta: no borra ni reescribe nada, a diferencia de `migrate dev`, que **no
debe ejecutarse nunca** contra producción.

### 3 · Datos iniciales

La primera vez hay que sembrar el marco KMK, los roles, la escala de
calificación y la cuenta de administración:

```bash
docker compose -f docker/docker-compose.yml exec backend \
  node --experimental-strip-types backend/prisma/seed/index.ts
```

Después de entrar por primera vez, **cambiar la contraseña del administrador**.

### 4 · Comprobación

```bash
curl -fsS http://localhost:8080/api/health
```

Debe responder `{"success":true,"data":{"status":"ok",...}}`.

## TLS

El compose sirve HTTP en claro a propósito: la terminación TLS corresponde al
proxy de la institución (nginx, Traefik o Caddy delante), que es donde ya viven
los certificados y su renovación.

Ese proxy debe reenviar `X-Forwarded-Proto`, porque de él depende que la cookie
de refresco se marque como `Secure`. Sin esa cabecera, la aplicación se cree en
HTTP y emite la cookie sin `Secure`.

En producción, además, el proxy debería añadir HSTS:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

No está en `nginx.conf` porque activar HSTS sin TLS funcionando deja el dominio
inaccesible durante un año en los navegadores que ya lo hayan visto.

## Copias de seguridad

Los datos que importan están **solo** en PostgreSQL. No hay estado en los
contenedores de aplicación: se pueden destruir y reconstruir sin pérdida.

```bash
# Copia
docker compose -f docker/docker-compose.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc medienpass > medienpass-$(date +%F).dump

# Restauración
docker compose -f docker/docker-compose.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d medienpass --clean --if-exists < medienpass-2026-09-09.dump
```

Dos advertencias que conviene leer antes de necesitarlas:

- **La copia contiene datos personales de menores**: nombres, documentos,
  correos y resultados académicos. Se cifra y se guarda donde se guarden los
  datos del colegio, no en un disco suelto ni en una nube personal.
- **Una copia que no se ha restaurado nunca no es una copia.** Conviene probar
  la restauración en un entorno aparte al menos una vez.

## Actualización

```bash
git pull
docker compose -f docker/docker-compose.yml --env-file .env up -d --build
```

Las migraciones se aplican solas al arrancar el backend. Antes de una
actualización que toque el esquema, hacer copia.

## Registros

```bash
docker compose -f docker/docker-compose.yml logs -f backend
```

Los registros son JSON estructurado (pino). Lo que **nunca** aparece en ellos,
por diseño: contraseñas, tokens JWT, el token de Phidias y los documentos de
identidad de los estudiantes. Si algo de eso aparece alguna vez en un registro,
es un fallo que hay que corregir, no un inconveniente.

## Cosas que quedan por hacer antes de considerarlo listo para producción

Se listan explícitamente para que nadie las dé por hechas:

1. **Rotar el token de Phidias.** El prototipo anterior lo incluía en el
   JavaScript del navegador y lo enviaba a través de proxies públicos de
   terceros (`corsproxy.io`, `api.allorigins.win`), que vieron la cabecera
   `Authorization` completa. Además viajaba en los `dist/` desplegados. No
   caduca hasta enero de 2031. **Debe considerarse comprometido.** Hasta
   rotarlo, `PHIDIAS_MODE=mock`.
2. **Registrar la aplicación en Microsoft Entra ID** y rellenar
   `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` y `ENTRA_CLIENT_SECRET`. Recordar que
   94 de los 1.177 estudiantes no pueden usar SSO —20 sin correo y 74 con
   cuentas personales—, así que el acceso con correo y contraseña sigue siendo
   necesario, no es un respaldo temporal.
3. **Clave de Google AI** para pasar `AI_PROVIDER` de `mock` a `google`.
4. **Definir la retención de datos**: cuánto tiempo se conservan los intentos y
   los registros de auditoría de estudiantes que ya no están en el colegio.
5. **Programar la copia de seguridad** y probar una restauración.

## Diagnóstico

| Síntoma                             | Dónde mirar                                                         |
| ----------------------------------- | ------------------------------------------------------------------- |
| El backend reinicia en bucle        | `logs backend`: casi siempre es una variable de entorno inválida    |
| «Configuración de entorno inválida» | El mensaje nombra la variable y qué esperaba                        |
| 502 desde nginx                     | El backend no pasa su `healthcheck`; ver sus registros              |
| La sesión se pierde al recargar     | Falta `X-Forwarded-Proto` en el proxy, o `APP_URL` no coincide      |
| «Cannot connect to database»        | `postgres` aún no está sano; el compose lo espera, pero comprobarlo |

## Almacenamiento de archivos

Las evidencias de los estudiantes y las imágenes de los enunciados no van a la
base de datos: van a S3. La base guarda una fila por archivo en `stored_files`,
que es lo que permite responder «¿cuánto ocupa el año pasado?» sin recorrer el
bucket y, sobre todo, **borrar de verdad** por año, por evaluación o por tipo.

### El bucket

Configuración aplicada en la creación, toda comprobable desde la consola:

| Ajuste            | Valor                           | Por qué                                                                    |
| ----------------- | ------------------------------- | -------------------------------------------------------------------------- |
| Acceso público    | Bloqueado por completo          | Son trabajos de menores de edad                                            |
| Cifrado en reposo | SSE-S3 (AES-256)                | Por defecto en cada objeto                                                 |
| Versionado        | Desactivado                     | Un borrado con versionado deja el objeto ahí; el requisito es lo contrario |
| CORS              | Solo el origen de la aplicación | El navegador sube directamente                                             |

### Cómo viaja un archivo

```
Navegador ── 1. pide permiso ──▶ Backend
          ◀── URL firmada (5 min) ──┘
          ── 2. PUT directo ──▶ S3
          ── 3. confirma ──▶ Backend ── HEAD ──▶ S3
                                     └─ crea la fila
```

El archivo **nunca pasa por el servidor**. Y el tercer paso no es burocracia:
el backend pregunta a S3 qué hay realmente en esa clave antes de dar el archivo
por bueno, de modo que la fila siempre describe algo que existe y con el tamaño
que dice. La credencial de AWS no sale del backend en ningún momento.

### Rutas dentro del bucket

```
evidence/{año}/{evaluación}/{intento}/{uuid}.{ext}
question-media/{evaluación}/{versión}/{uuid}.{ext}
```

Sirven para orientarse en la consola. El borrado selectivo **no** se hace por
prefijo sino por las columnas de `stored_files`: por prefijo habría que
adivinar de antemano todas las dimensiones por las que alguien querrá limpiar.

### Borrar

Tres caminos, y en los tres se borra primero de S3 y después la fila. Al revés,
un fallo de red dejaría objetos que ninguna fila menciona: basura invisible.

1. **Administración → Archivos.** Por año y por tipo, con simulación previa. La
   confirmación viaja con el número exacto de archivos: si alguien sube algo
   entre la simulación y el borrado, la operación se detiene.
2. **Al eliminar una evaluación.** Automático. La clave foránea de
   `stored_files` impide borrar la evaluación mientras le queden archivos, así
   que el orden correcto lo obliga la base y no la buena memoria.
3. **Al iniciar año lectivo.** Opcional y **apagado por defecto**. El año
   anterior conserva sus notas, y una nota puesta sobre una evidencia que ya no
   existe es una nota que nadie puede volver a justificar. Tiene sentido si la
   política del colegio es no conservar trabajos más allá del curso; no lo tiene
   «para hacer sitio».

Todo borrado queda en auditoría como `DELETE_STORED_FILES`, con el alcance, el
motivo escrito y el recuento.

### Texto enriquecido

Los enunciados y las respuestas abiertas se guardan como HTML, lo que abre una
vía de ataque concreta: un enunciado con `<script>` se ejecutaría en la sesión
de cada estudiante que abra la evaluación, y una respuesta abierta con lo mismo
en la de quien la corrige.

La defensa es una lista blanca —`packages/shared/src/rich-text.ts`— aplicada en
dos sitios: el servidor limpia **al guardar**, que es la autoridad, y el cliente
vuelve a limpiar al pintar como segunda barrera. El servidor manda porque
cualquiera puede enviar un `PUT` saltándose el navegador entero.

No se admite SVG aunque sea una imagen: puede llevar scripts dentro.
