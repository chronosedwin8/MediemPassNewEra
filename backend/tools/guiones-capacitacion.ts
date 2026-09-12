/**
 * Guiones de los vídeos de capacitación docente, uno por competencia KMK.
 *
 * Este archivo es la fuente: es lo que se envía a generar, no una copia de
 * referencia. La documentación apunta aquí en lugar de repetir el texto,
 * porque una prosa duplicada se desincroniza en silencio y acaba habiendo dos
 * versiones del guion sin que nadie sepa cuál se grabó.
 *
 * Cada guion resume el módulo que acompaña y usa sus mismos ejemplos, para que
 * el vídeo y el material escrito no se contradigan. Si se reescribe un módulo
 * en `prisma/seed/training.ts`, se reescribe aquí y se vuelve a generar.
 *
 * El vídeo **no sustituye al material**: lo abre. Un módulo de cuarenta y
 * cinco minutos leído en frío se abandona en el primer párrafo; minuto y medio
 * explicando qué se va a ver y por qué importa cambia esa cifra. Por eso
 * ninguno intenta enseñar la competencia entera.
 */

export interface Escena {
  /**
   * Lo que se ve escrito, grande, mientras se narra.
   *
   * No es un resumen de la narración: es la frase que queremos que quede si
   * alguien ve el vídeo sin sonido, que es como se ve en una sala de
   * profesores o en el móvil entre clase y clase.
   */
  titular: string;
  /** Lo que se escucha. */
  texto: string;
}

export interface Guion {
  /** Código del módulo en `training_modules`. */
  moduleCode: string;
  /** Número de competencia KMK, para el color y el distintivo. */
  competencia: string;
  /** Título del contenido que se creará en el módulo. */
  titulo: string;
  /** Qué se verá, en una frase. Va como cuerpo del contenido. */
  resumen: string;
  escenas: Escena[];
}

export const GUIONES: Guion[] = [
  {
    moduleCode: 'KMK-M1',
    competencia: '1',
    titulo: 'Presentación del módulo: buscar, procesar y archivar',
    resumen:
      'Minuto y medio sobre qué mide de verdad esta competencia y qué encontrará en el módulo.',
    escenas: [
      {
        titular: 'Formular la pregunta antes de buscarla',
        texto:
          'Esta competencia no trata de saber usar un buscador. Trata de algo que se nos escapa con frecuencia: formular la pregunta antes de buscarla. Un estudiante que copia el primer resultado no ha ejercido esta competencia, aunque el resultado sea correcto. Lo que queremos que aprenda es a mirar quién firma lo que encontró, con qué fecha y con qué respaldo.',
      },
      {
        titular: 'Cuatro operadores, una sesión entera',
        texto:
          'En este módulo verá cuatro operadores de búsqueda que cambian por completo la calidad de un trabajo escolar: comillas para frase exacta, site dos puntos para restringir a un dominio, el guion para excluir un término, y los filtros de fecha. Son solo cuatro, y merecen una sesión entera.',
      },
      {
        titular: 'La evaluación es la que certifica',
        texto:
          'Encontrará también una actividad para contrastar tres fuentes sobre un mismo hecho, y la estrategia de la Conferencia de Ministros de Educación alemana, que es de donde sale todo este marco. Al terminar el material le espera la evaluación: es la que certifica la competencia.',
      },
    ],
  },
  {
    moduleCode: 'KMK-M2',
    competencia: '2',
    titulo: 'Presentación del módulo: comunicar y colaborar',
    resumen:
      'Por qué repartirse el trabajo no es colaborar, y qué se acuerda antes de abrir un espacio compartido.',
    escenas: [
      {
        titular: 'Colaborar no es repartirse el trabajo',
        texto:
          'Colaborar no es repartirse el trabajo. Cuatro estudiantes que dividen un documento en cuatro partes y las pegan al final no han colaborado: han trabajado en paralelo.',
      },
      {
        titular: 'La herramienta no crea la colaboración',
        texto:
          'La diferencia está en si se leen entre ellos, si comentan el texto del otro, si el resultado es mejor que la suma de las partes. Eso es lo que esta competencia pide que enseñemos, y no aparece solo porque la herramienta permita edición simultánea.',
      },
      {
        titular: 'Pruébelo con un curso real',
        texto:
          'Trabajaremos las normas de convivencia que conviene acordar antes de abrir un espacio compartido, y qué hacer cuando aparece el cibermobbing, que aparece. Hay material de klicksafe listo para llevar al aula. Una advertencia: este es el módulo donde más fácil resulta quedarse en la teoría. Pruebe la actividad con un curso real antes de presentarse a la evaluación.',
      },
    ],
  },
  {
    moduleCode: 'KMK-M3',
    competencia: '3',
    titulo: 'Presentación del módulo: producir y presentar',
    resumen: 'La diferencia entre reunir material ajeno y producir algo propio, con criterio.',
    escenas: [
      {
        titular: 'Reunir no es producir',
        texto:
          'Reunir imágenes ajenas en una diapositiva no es producir. Producir es decidir qué se quiere transmitir, elegir el formato adecuado y construir algo con criterio propio, aunque reutilice piezas.',
      },
      {
        titular: 'El formato no es decoración',
        texto:
          'La diferencia la notará enseguida cuando pida el mismo contenido en tres formatos distintos: texto, esquema y audio breve. Sus estudiantes descubrirán que el formato no es decoración, porque cambia qué se puede decir y qué se pierde.',
      },
      {
        titular: 'Si no puedes citarlo, no lo uses',
        texto:
          'Este módulo incluye lo más aplicable de toda la capacitación: una guía de tres formatos de vídeo explicativo y cómo grabarlos con una tableta o un móvil, que es lo que ya tenemos. Y una regla sobre derechos de autor que funciona con adolescentes: si no sabes de dónde salió y no puedes citarlo, no lo uses. Enséñela desde el principio, porque corregirlo después cuesta mucho más.',
      },
    ],
  },
  {
    moduleCode: 'KMK-M4',
    competencia: '4',
    titulo: 'Presentación del módulo: proteger y actuar de forma segura',
    resumen:
      'El módulo que no protege un archivo, sino a un menor: cuentas, datos del alumnado y suplantación.',
    escenas: [
      {
        titular: 'Su contraseña protege a sus estudiantes',
        texto:
          'Empecemos por lo incómodo: la contraseña de su cuenta institucional protege también los datos de sus estudiantes.',
      },
      {
        titular: 'Recoger solo lo que se va a usar',
        texto:
          'Veremos qué protege de verdad una cuenta, que es menos de lo que solemos creer, y el criterio de la mínima información aplicado a los datos del alumnado: recoger solo lo que se va a usar, y guardarlo solo mientras haga falta.',
      },
      {
        titular: 'La prisa es la señal',
        texto:
          'Dedicaremos una parte a reconocer un intento de suplantación. No son los correos con faltas de ortografía de hace diez años: hoy llegan bien escritos, con el logotipo correcto y con prisa. La prisa es la señal. Este es el módulo que más directamente afecta a terceros. Lo que aquí se aprende no protege un archivo: protege a un menor.',
      },
    ],
  },
  {
    moduleCode: 'KMK-M5',
    competencia: '5',
    titulo: 'Presentación del módulo: resolver problemas con herramientas digitales',
    resumen: 'Elegir la herramienta que resuelve el problema, y reconocer cuándo ninguna lo hace.',
    escenas: [
      {
        titular: 'La herramienta adecuada, no la de moda',
        texto:
          'La herramienta adecuada, no la de moda. Esta competencia se malinterpreta con facilidad: no mide cuántas aplicaciones conoce un docente, sino si sabe elegir la que resuelve el problema que tiene delante, y si sabe reconocer cuándo ninguna lo resuelve.',
      },
      {
        titular: 'Pensamiento algorítmico sin programar',
        texto:
          'Trabajaremos el pensamiento algorítmico sin programar: descomponer una tarea en pasos, detectar el paso ambiguo y corregirlo. La actividad del módulo pide escribir instrucciones a prueba de malentendidos, y suele ser reveladora: lo que parecía claro deja de serlo en cuanto otra persona intenta seguirlo.',
      },
      {
        titular: 'Para planear el año, no una sesión',
        texto:
          'Encontrará además un currículo completo de ciudadanía digital organizado por edades, útil para planear el año entero y no solo una sesión.',
      },
    ],
  },
  {
    moduleCode: 'KMK-M6',
    competencia: '6',
    titulo: 'Presentación del módulo: analizar y reflexionar sobre los medios',
    resumen:
      'La competencia más transversal, y la que más cambia según lo practicado en las otras.',
    escenas: [
      {
        titular: 'Detrás de cada contenido hay una intención',
        texto: 'Detrás de cada contenido hay una intención. Detrás de cada recomendación, también.',
      },
      {
        titular: 'El algoritmo también es un medio',
        texto:
          'Este módulo cierra la capacitación con la competencia más transversal: analizar quién produce lo que consumimos, con qué propósito y quién lo paga. Y una pieza que solemos dejar fuera: el algoritmo, que no es un conducto neutral sino un medio más, con sus propios criterios sobre qué merece verse.',
      },
      {
        titular: 'Hágalo al final, pero vuelva a él',
        texto:
          'Verá el marco de competencia digital docente del INTEF, que le servirá para situar su propio nivel más allá de esta plataforma. Una recomendación final: haga este módulo al final, pero vuelva a él. Es el que más cambia según lo que haya practicado en los otros cinco.',
      },
    ],
  },
];

export function findGuion(moduleCode: string): Guion | undefined {
  return GUIONES.find((guion) => guion.moduleCode === moduleCode.toUpperCase());
}
