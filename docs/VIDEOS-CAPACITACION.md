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

## Ajustes comunes

Valen para los seis, y no hay que repetirlos: los fija la herramienta.
Se recogen aquí para que el criterio quede escrito en algún sitio, no solo
en el código que lo aplica.

| Ajuste       | Valor                               | Motivo                                                                                                                  |
| ------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Idioma       | Español (neutro / latinoamericano)  | El profesorado del colegio trabaja en español; el material de referencia está en alemán e inglés y ya se enlaza aparte. |
| Formato      | 16:9, 1080p                         | Es como se incrusta en el módulo y como se proyecta en una jornada pedagógica.                                          |
| Duración     | 90–120 segundos                     | Más largo deja de ser una entrada al módulo y compite con él.                                                           |
| Tono         | Profesional cercano, sin efusividad | Habla a colegas, no a un auditorio.                                                                                     |
| Avatar y voz | El mismo en los seis                | Seis presentadores distintos se leen como seis materiales sueltos; uno solo, como un programa.                          |
| Subtítulos   | Activados, en español               | Se ven en salas de profesores y en el móvil, a menudo sin sonido.                                                       |

## Dónde están los guiones

En [`backend/tools/guiones-capacitacion.ts`](../backend/tools/guiones-capacitacion.ts), uno
por módulo, divididos en escenas.

Están en código y no aquí abajo por un motivo concreto: ese archivo es lo que
se envía a generar. Un guion copiado en la documentación se desincroniza en
silencio del que se grabó, y acaba habiendo dos versiones sin que nadie sepa
cuál se usó. Para revisarlos o retocarlos antes de generar, se edita ese
archivo.

Cada guion resume el módulo que acompaña y usa sus mismos ejemplos —los cuatro
operadores de búsqueda en el M1, el cibermobbing en el M2, la regla de derechos
de autor en el M3— para que el vídeo y el material escrito no se contradigan.
Si se reescribe un módulo en `prisma/seed/training.ts`, se reescribe su guion y
se vuelve a generar.

## Cómo se generan

Un comando, y el mismo resultado cada vez. No pasa por el conector MCP de
HeyGen: ese sirve para pedir un vídeo suelto en una conversación, y esto tiene
que poder repetirse dentro de dos años por alguien que no estuvo en la
conversación.

**Preparación, una sola vez.** Crear una clave en HeyGen, en Settings → API →
New API key, y ponerla en `.env` como `HEYGEN_API_KEY`. No va al repositorio:
`.env` está en `.gitignore` y `.env.example` solo lleva el nombre de la
variable.

**Elegir presentador y voz.**

```bash
npm run -w backend videos:avatares
```

Lista los avatares de la cuenta y las voces en español. Copiar un `avatar_id` y
un `voice_id` a `HEYGEN_AVATAR_ID` y `HEYGEN_VOICE_ID` en `.env`. El mismo en
los seis: seis presentadores distintos se leen como seis materiales sueltos.

**Una prueba antes de los seis.**

```bash
npm run -w backend videos -- --modulo KMK-M1
```

Genera uno solo y deja la URL en pantalla, sin tocar la base de datos. Sirve
para ver el avatar, la voz y el ritmo antes de comprometer los otros cinco.

**Los seis, y colocados en sus módulos.**

```bash
npm run -w backend videos -- --aplicar
```

Cada vídeo queda como **primer** contenido de su módulo, porque es una
presentación y detrás del material ya no presenta nada. El resto de contenidos
se desplaza una posición. Volver a ejecutarlo actualiza el vídeo que ya
encabezaba el módulo en lugar de añadir otro, así que es seguro repetirlo.

La generación tarda unos minutos por vídeo; la herramienta consulta el estado
cada quince segundos e informa del avance.

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
