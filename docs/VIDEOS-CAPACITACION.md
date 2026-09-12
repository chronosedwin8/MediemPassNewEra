# Vídeos de la capacitación docente

Guiones en español para los seis módulos de formación, uno por competencia KMK,
y el procedimiento para generarlos con HeyGen y colocarlos en la plataforma.

Los guiones no son genéricos: cada uno resume el módulo que acompaña y usa sus
mismos ejemplos, para que el vídeo y el material escrito no se contradigan. Si
mañana se reescribe un módulo, este archivo se reescribe con él.

## Por qué un vídeo y no más texto

El vídeo no sustituye al material: lo abre. Un módulo de cuarenta y cinco
minutos leído en frío se abandona en el primer párrafo; minuto y medio de
alguien explicando qué se va a ver y por qué importa cambia esa tasa. Por eso
los guiones son cortos y ninguno intenta enseñar la competencia entera — eso lo
hacen el material y la evaluación.

## De qué está hecho cada vídeo

Tres piezas, ninguna de las cuales exige un plan especial ni una cuenta nueva.

| Pieza        | Con qué                        | Por qué esa                                                                                                 |
| ------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Narración    | ElevenLabs, voz colombiana     | El colegio está en Barranquilla. Una voz peninsular se entiende igual pero suena a material comprado fuera. |
| Diapositivas | Chrome en modo headless        | Comparten tipografía y color con la plataforma en lugar de parecerse a ella, y Chrome ya está instalado.    |
| Montaje      | ffmpeg                         | Imagen fija por escena, sin animación: el movimiento compite con lo que se está explicando.                 |
| Subtítulos   | Marcas de tiempo de ElevenLabs | Van quemados y siempre. Estos vídeos se ven en salas de profesores y en el móvil, sin sonido.               |

No se usa un avatar. Se valoró HeyGen y su API queda fuera del plan contratado;
además, para material que va a estar años en circulación, una diapositiva sobria
con una buena voz envejece mejor que un presentador sintético.

## Dónde están los guiones

En [`backend/tools/guiones-capacitacion.ts`](../backend/tools/guiones-capacitacion.ts), uno
por módulo, divididos en escenas. Cada escena tiene dos cosas: lo que se dice y
el titular que queda en pantalla.

Están en código y no aquí abajo por un motivo concreto: ese archivo es lo que se
envía a generar. Un guion copiado en la documentación se desincroniza en
silencio del que se grabó, y acaba habiendo dos versiones sin que nadie sepa
cuál se usó.

Cada guion resume el módulo que acompaña y usa sus mismos ejemplos —los cuatro
operadores de búsqueda en el M1, el cibermobbing en el M2, la regla de derechos
de autor en el M3— para que el vídeo y el material escrito no se contradigan. Si
se reescribe un módulo en `prisma/seed/training.ts`, se reescribe su guion y se
vuelve a generar.

## Cómo se generan

**Preparación, una sola vez.** `ELEVENLABS_API_KEY` en `.env`, y ffmpeg:

```bash
winget install --id Gyan.FFmpeg -e --scope user
```

No hace falta reiniciar la consola: la herramienta busca ffmpeg donde winget lo
deja, además de en el PATH.

**Generar.**

```bash
npm run -w backend videos                    # los seis
npm run -w backend videos -- --modulo KMK-M1 # uno solo, para probar
```

Los MP4 quedan en `media/capacitacion/`, unos 1,2 MB y cincuenta segundos cada
uno.

**Colocarlos en los módulos.**

```bash
npm run -w backend videos:aplicar
```

Copia los vídeos a `frontend/public/media/capacitacion/` y los deja como
**primer** contenido de su módulo, porque son una presentación y detrás del
material ya no presentan nada. El resto de contenidos se desplaza una posición.
Repetirlo actualiza el vídeo que ya encabezaba el módulo en lugar de añadir
otro, así que es seguro relanzarlo.

**Cambiar la voz.** `ELEVENLABS_VOICE_ID` en `.env`. La misma en los seis: seis
voces distintas se leen como seis materiales sueltos, una sola como un programa.

## Cómo quedan dentro de la capacitación

Dos caminos, y el segundo es mejor a medio plazo.

**Enlace de HeyGen.** En el panel de HeyGen, compartir el vídeo y copiar la URL
(`https://app.heygen.com/share/…`). En Medienpass, entrar al módulo desde la
administración de capacitación, añadir un contenido de tipo **Vídeo** en la
primera posición, con su título y su URL. El reproductor traduce por sí solo el
enlace de compartir al del reproductor incrustado.

**Archivo propio.** Descargar el MP4 desde HeyGen y servirlo desde el
almacenamiento del colegio. La URL termina en `.mp4` y se reproduce igual, sin
depender de que la cuenta de HeyGen siga activa ni de que el enlace público siga
compartido. Para material que va a estar años en circulación, es lo sensato.

En los dos casos el vídeo se ve **dentro** del módulo. No se abre otra pestaña:
quien sale de la plataforma a menudo no vuelve, y el avance se quedaba a medias
aunque la persona hubiera visto el vídeo entero.

### Lo que no se puede incrustar

El reproductor solo incrusta HeyGen, YouTube —por su dominio sin cookies— y
Vimeo, además de archivos de vídeo servidos por HTTPS. Cualquier otra dirección
se deja como enlace.

No es una limitación que convenga levantar a la ligera. Incrustar lo que diga
una URL guardada en la base de datos significa que quien edite un módulo puede
meter contenido ajeno en una página donde el profesorado está autenticado. Si
hace falta otra plataforma, se añade a la lista del reproductor y a la política
de seguridad del servidor, a la vez y a propósito.
