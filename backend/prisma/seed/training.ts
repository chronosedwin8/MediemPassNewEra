import type { PrismaClient } from '@prisma/client';
import type { LocalizedText } from '@medienpass/shared';

/**
 * Capacitación docente: un módulo por competencia KMK.
 *
 * El contenido es real y aprovechable, no relleno: cada módulo explica qué
 * significa la competencia en el aula, qué se espera del docente y qué puede
 * poner en práctica. Ampliarlo es añadir contenidos al módulo, no rehacerlo.
 */

interface ContentSeed {
  type: 'TEXT' | 'VIDEO' | 'DOCUMENT' | 'LINK' | 'ACTIVITY';
  title: LocalizedText;
  body?: LocalizedText;
  url?: string;
}

interface ModuleSeed {
  code: string;
  competencyCode: string;
  estimatedMinutes: number;
  title: LocalizedText;
  description: LocalizedText;
  contents: ContentSeed[];
}

const es = (value: string): LocalizedText => ({ es: value, de: value, en: value });

const MODULES: ModuleSeed[] = [
  {
    code: 'KMK-M1',
    competencyCode: '1',
    estimatedMinutes: 45,
    title: {
      es: 'Buscar, procesar y archivar en el aula',
      de: 'Suchen, Verarbeiten und Aufbewahren im Unterricht',
      en: 'Searching, processing and storing in the classroom',
    },
    description: {
      es: 'Cómo enseñar a localizar información fiable, juzgarla y conservarla de forma que se pueda recuperar y citar.',
      de: 'Wie man vermittelt, verlässliche Informationen zu finden, zu bewerten und so aufzubewahren, dass sie wiedergefunden und zitiert werden können.',
      en: 'How to teach finding reliable information, judging it, and storing it so it can be retrieved and cited.',
    },
    contents: [
      {
        type: 'TEXT',
        title: es('Qué mide realmente esta competencia'),
        body: es(
          'No se trata de saber usar un buscador. Se trata de formular una pregunta antes de buscarla, elegir términos que acoten, y sobre todo de juzgar lo que aparece: quién lo firma, con qué fecha y con qué respaldo. Un estudiante que copia el primer resultado no ha ejercido esta competencia aunque el resultado sea correcto.',
        ),
      },
      {
        type: 'TEXT',
        title: es('Operadores que conviene enseñar'),
        body: es(
          'Comillas para frase exacta, site: para restringir a un dominio, guion para excluir un término, y filtros de fecha. Son cuatro y cambian por completo la calidad de una búsqueda escolar. Merece la pena dedicarles una sesión entera y volver a ellos cada vez que se pida un trabajo.',
        ),
      },
      {
        type: 'ACTIVITY',
        title: es('Actividad: contrastar tres fuentes'),
        body: es(
          'Pida a sus estudiantes una afirmación polémica y tres fuentes que la sostengan. La tarea no es decidir si es cierta, sino averiguar si las tres fuentes son independientes o si las tres copian a la misma. Es el ejercicio que mejor revela la diferencia entre repetición y verificación.',
        ),
      },
    ],
  },
  {
    code: 'KMK-M2',
    competencyCode: '2',
    estimatedMinutes: 40,
    title: {
      es: 'Comunicar y colaborar con medios digitales',
      de: 'Kommunizieren und Kooperieren mit digitalen Medien',
      en: 'Communicating and collaborating with digital media',
    },
    description: {
      es: 'Trabajo conjunto en documentos compartidos, normas de convivencia digital y participación responsable.',
      de: 'Gemeinsames Arbeiten in geteilten Dokumenten, Umgangsregeln und verantwortliche Teilhabe.',
      en: 'Working together in shared documents, rules of digital conduct and responsible participation.',
    },
    contents: [
      {
        type: 'TEXT',
        title: es('Colaborar no es repartirse el trabajo'),
        body: es(
          'Un documento compartido en el que cada estudiante escribe su párrafo y nadie lee el de los demás es una división de tareas, no una colaboración. La competencia aparece cuando revisan lo ajeno, comentan y llegan a un texto que ninguno habría escrito solo.',
        ),
      },
      {
        type: 'TEXT',
        title: es('Normas de convivencia que conviene acordar'),
        body: es(
          'Antes del primer trabajo en grupo digital, acuerde con la clase tres cosas: cómo se corrige el texto de otro, qué se comenta y qué se habla en persona, y qué pasa si alguien no participa. Acordarlo después de que surja el conflicto siempre llega tarde.',
        ),
      },
    ],
  },
  {
    code: 'KMK-M3',
    competencyCode: '3',
    estimatedMinutes: 50,
    title: {
      es: 'Producir y presentar contenidos propios',
      de: 'Eigene Inhalte produzieren und präsentieren',
      en: 'Producing and presenting original content',
    },
    description: {
      es: 'Crear material digital, transformar el existente e integrarlo respetando los derechos de autor.',
      de: 'Digitale Inhalte erstellen, vorhandenes Material weiterverarbeiten und dabei das Urheberrecht beachten.',
      en: 'Creating digital material, adapting what exists and integrating it while respecting copyright.',
    },
    contents: [
      {
        type: 'TEXT',
        title: es('Del collage a la producción'),
        body: es(
          'Reunir imágenes ajenas en una diapositiva no es producir. Producir es decidir qué se quiere transmitir, elegir el formato adecuado y construir algo con criterio propio, aunque reutilice piezas.',
        ),
      },
      {
        type: 'TEXT',
        title: es('Derechos de autor en el aula'),
        body: es(
          'La regla práctica que funciona con adolescentes: si no sabes de dónde salió y no puedes citarlo, no lo uses. Enseñe a buscar material con licencia abierta desde el principio; corregirlo después es mucho más costoso que hacerlo bien la primera vez.',
        ),
      },
      {
        type: 'ACTIVITY',
        title: es('Actividad: la misma idea en tres formatos'),
        body: es(
          'Un mismo contenido presentado como texto, como esquema y como audio breve. El objetivo es que descubran que el formato no es decoración: cambia qué se puede decir y qué se pierde.',
        ),
      },
    ],
  },
  {
    code: 'KMK-M4',
    competencyCode: '4',
    estimatedMinutes: 45,
    title: {
      es: 'Proteger y actuar de forma segura',
      de: 'Schützen und sicher agieren',
      en: 'Protecting and acting safely',
    },
    description: {
      es: 'Seguridad de las cuentas, protección de datos personales del alumnado y uso saludable de la tecnología.',
      de: 'Kontosicherheit, Schutz personenbezogener Daten der Schülerinnen und Schüler und gesunder Technikeinsatz.',
      en: 'Account security, protecting students’ personal data and healthy use of technology.',
    },
    contents: [
      {
        type: 'TEXT',
        title: es('Lo que de verdad protege una cuenta'),
        body: es(
          'La verificación en dos pasos detiene la inmensa mayoría de los accesos no autorizados. Cambiar la contraseña cada mes, no. Si solo va a adoptar una medida, que sea el segundo factor.',
        ),
      },
      {
        type: 'TEXT',
        title: es('Datos del alumnado: el criterio de la mínima información'),
        body: es(
          'Antes de compartir cualquier listado, pregúntese qué es lo mínimo que la otra persona necesita saber. Un documento de identidad casi nunca lo es. Comparta por los canales institucionales y solo con quien deba verlo.',
        ),
      },
      {
        type: 'TEXT',
        title: es('Reconocer un intento de suplantación'),
        body: es(
          'Urgencia, una petición de credenciales y un remitente que casi coincide con el institucional. Cuando se juntan las tres, no es casualidad. Ante la duda, escriba usted la dirección en el navegador en lugar de pulsar el enlace.',
        ),
      },
    ],
  },
  {
    code: 'KMK-M5',
    competencyCode: '5',
    estimatedMinutes: 55,
    title: {
      es: 'Resolver problemas y actuar con herramientas digitales',
      de: 'Problemlösen und Handeln mit digitalen Werkzeugen',
      en: 'Solving problems and acting with digital tools',
    },
    description: {
      es: 'Elegir la herramienta adecuada, reconocer las propias carencias y pensar algorítmicamente.',
      de: 'Das passende Werkzeug wählen, eigene Defizite erkennen und algorithmisch denken.',
      en: 'Choosing the right tool, recognising one’s own gaps and thinking algorithmically.',
    },
    contents: [
      {
        type: 'TEXT',
        title: es('La herramienta adecuada, no la de moda'),
        body: es(
          'Una hoja de cálculo resuelve en dos minutos lo que una aplicación llamativa tarda media hora en hacer peor. Enseñe a elegir preguntándose primero qué hay que hacer con los datos, no qué programa se quiere usar.',
        ),
      },
      {
        type: 'TEXT',
        title: es('Pensamiento algorítmico sin programar'),
        body: es(
          'Describir un procedimiento paso a paso, sin ambigüedades y previendo los casos raros, es pensamiento algorítmico aunque no se escriba una sola línea de código. Una receta bien escrita ya lo es.',
        ),
      },
      {
        type: 'ACTIVITY',
        title: es('Actividad: instrucciones a prueba de malentendidos'),
        body: es(
          'Que escriban instrucciones para una tarea cotidiana y otro compañero las siga al pie de la letra, sin interpretar. Es la forma más rápida de que descubran cuánto damos por supuesto.',
        ),
      },
    ],
  },
  {
    code: 'KMK-M6',
    competencyCode: '6',
    estimatedMinutes: 40,
    title: {
      es: 'Analizar y reflexionar sobre los medios',
      de: 'Medien analysieren und reflektieren',
      en: 'Analysing and reflecting on media',
    },
    description: {
      es: 'Examinar críticamente los contenidos digitales y comprender el efecto de la digitalización sobre las personas.',
      de: 'Digitale Inhalte kritisch prüfen und die Wirkung der Digitalisierung auf Menschen verstehen.',
      en: 'Critically examining digital content and understanding the effect of digitalisation on people.',
    },
    contents: [
      {
        type: 'TEXT',
        title: es('Detrás de cada contenido hay una intención'),
        body: es(
          'La pregunta útil no es «¿esto es verdad?» sino «¿quién gana algo si me lo creo?». Funciona con publicidad, con noticias y con recomendaciones de un algoritmo, y es una pregunta que un adolescente entiende de inmediato.',
        ),
      },
      {
        type: 'TEXT',
        title: es('El algoritmo también es un medio'),
        body: es(
          'Lo que aparece en una red social no es lo que ocurre, sino lo que un sistema decidió mostrar. Hacer visible esa mediación es parte del trabajo: sin ella, el estudiante confunde su portada con el mundo.',
        ),
      },
    ],
  },
];

export async function seedTrainingModules(prisma: PrismaClient): Promise<void> {
  let contentCount = 0;

  for (const [index, module] of MODULES.entries()) {
    const competency = await prisma.kmkCompetency.findUnique({
      where: { code: module.competencyCode },
    });
    if (!competency) continue;

    const created = await prisma.trainingModule.upsert({
      where: { code: module.code },
      create: {
        code: module.code,
        kmkCompetencyId: competency.id,
        title: module.title,
        description: module.description,
        estimatedMinutes: module.estimatedMinutes,
        position: index,
      },
      update: {
        title: module.title,
        description: module.description,
        estimatedMinutes: module.estimatedMinutes,
        position: index,
      },
    });

    for (const [position, content] of module.contents.entries()) {
      await prisma.trainingContent.upsert({
        where: { moduleId_position: { moduleId: created.id, position } },
        create: {
          moduleId: created.id,
          type: content.type,
          title: content.title,
          body: content.body ?? undefined,
          url: content.url ?? null,
          position,
        },
        update: { type: content.type, title: content.title, body: content.body ?? undefined },
      });
      contentCount += 1;
    }
  }

  console.warn(`  capacitación: ${MODULES.length} módulos · ${contentCount} contenidos`);
}
