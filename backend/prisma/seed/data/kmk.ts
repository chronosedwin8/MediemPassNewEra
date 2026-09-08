import type { LocalizedText } from '@medienpass/shared';

/**
 * Marco de competencias digitales KMK
 * ("Bildung in der digitalen Welt", Kultusministerkonferenz).
 *
 * Las seis competencias y sus subcompetencias son el marco oficial alemán,
 * no una invención de la plataforma. Se cargan como datos, no como texto en
 * la interfaz, porque cada pregunta se asocia a una de ellas y sobre esa
 * asociación se construye toda la analítica.
 *
 * El tercer nivel (indicadores) queda modelado y vacío: lo definirá el
 * colegio según su propio currículo.
 */

export interface SubcompetencySeed {
  code: string;
  name: LocalizedText;
  description?: LocalizedText;
}

export interface CompetencySeed {
  code: string;
  color: string;
  icon: string;
  name: LocalizedText;
  description: LocalizedText;
  subcompetencies: SubcompetencySeed[];
}

export const KMK_COMPETENCIES: CompetencySeed[] = [
  {
    code: '1',
    color: '#2563eb',
    icon: 'search',
    name: {
      es: 'Buscar, procesar y archivar',
      de: 'Suchen, Verarbeiten und Aufbewahren',
      en: 'Searching, processing and storing',
    },
    description: {
      es: 'Localizar información de forma eficaz en entornos digitales, evaluar su calidad y fiabilidad, y organizarla y conservarla de manera que pueda recuperarse cuando se necesite.',
      de: 'Informationen in digitalen Umgebungen gezielt finden, ihre Qualität und Verlässlichkeit bewerten sowie sie so organisieren und aufbewahren, dass sie bei Bedarf wiedergefunden werden.',
      en: 'Find information effectively in digital environments, assess its quality and reliability, and organise and store it so it can be retrieved when needed.',
    },
    subcompetencies: [
      {
        code: '1.1',
        name: { es: 'Buscar y filtrar', de: 'Suchen und Filtern', en: 'Searching and filtering' },
      },
      {
        code: '1.2',
        name: { es: 'Analizar y valorar', de: 'Auswerten und Bewerten', en: 'Analysing and evaluating' },
      },
      {
        code: '1.3',
        name: { es: 'Guardar y recuperar', de: 'Speichern und Abrufen', en: 'Storing and retrieving' },
      },
    ],
  },
  {
    code: '2',
    color: '#0891b2',
    icon: 'users',
    name: {
      es: 'Comunicar y colaborar',
      de: 'Kommunizieren und Kooperieren',
      en: 'Communicating and collaborating',
    },
    description: {
      es: 'Interactuar con otras personas mediante medios digitales, compartir información, trabajar de forma conjunta y participar en la sociedad respetando las normas de convivencia digital.',
      de: 'Mit anderen über digitale Medien interagieren, Informationen teilen, gemeinsam arbeiten und unter Beachtung der Umgangsregeln aktiv an der Gesellschaft teilhaben.',
      en: 'Interact with others through digital media, share information, work together and participate in society while observing the rules of digital conduct.',
    },
    subcompetencies: [
      { code: '2.1', name: { es: 'Interactuar', de: 'Interagieren', en: 'Interacting' } },
      { code: '2.2', name: { es: 'Compartir', de: 'Teilen', en: 'Sharing' } },
      { code: '2.3', name: { es: 'Colaborar', de: 'Zusammenarbeiten', en: 'Collaborating' } },
      {
        code: '2.4',
        name: {
          es: 'Conocer y respetar las normas de convivencia',
          de: 'Umgangsregeln kennen und einhalten',
          en: 'Knowing and observing rules of conduct',
        },
      },
      {
        code: '2.5',
        name: {
          es: 'Participar activamente en la sociedad',
          de: 'An der Gesellschaft aktiv teilhaben',
          en: 'Actively participating in society',
        },
      },
    ],
  },
  {
    code: '3',
    color: '#7c3aed',
    icon: 'palette',
    name: {
      es: 'Producir y presentar',
      de: 'Produzieren und Präsentieren',
      en: 'Producing and presenting',
    },
    description: {
      es: 'Crear contenidos digitales propios, transformar e integrar materiales existentes y presentarlos de forma adecuada, respetando la normativa sobre derechos de autor.',
      de: 'Eigene digitale Inhalte erstellen, vorhandenes Material weiterverarbeiten und integrieren sowie angemessen präsentieren, unter Beachtung des Urheberrechts.',
      en: 'Create original digital content, adapt and integrate existing material and present it appropriately, respecting copyright rules.',
    },
    subcompetencies: [
      {
        code: '3.1',
        name: { es: 'Desarrollar y producir', de: 'Entwickeln und Produzieren', en: 'Developing and producing' },
      },
      {
        code: '3.2',
        name: {
          es: 'Transformar e integrar',
          de: 'Weiterverarbeiten und Integrieren',
          en: 'Adapting and integrating',
        },
      },
      {
        code: '3.3',
        name: {
          es: 'Respetar la normativa legal',
          de: 'Rechtliche Vorgaben beachten',
          en: 'Observing legal requirements',
        },
      },
    ],
  },
  {
    code: '4',
    color: '#059669',
    icon: 'shield',
    name: {
      es: 'Proteger y actuar de forma segura',
      de: 'Schützen und sicher Agieren',
      en: 'Protecting and acting safely',
    },
    description: {
      es: 'Moverse con seguridad en entornos digitales, proteger los datos personales y la privacidad, y cuidar la salud y el medio ambiente en el uso de la tecnología.',
      de: 'Sich in digitalen Umgebungen sicher bewegen, personenbezogene Daten und Privatsphäre schützen sowie Gesundheit und Umwelt beim Technikeinsatz berücksichtigen.',
      en: 'Act safely in digital environments, protect personal data and privacy, and safeguard health and the environment when using technology.',
    },
    subcompetencies: [
      {
        code: '4.1',
        name: {
          es: 'Actuar con seguridad en entornos digitales',
          de: 'Sicher in digitalen Umgebungen agieren',
          en: 'Acting safely in digital environments',
        },
      },
      {
        code: '4.2',
        name: {
          es: 'Proteger los datos personales y la privacidad',
          de: 'Persönliche Daten und Privatsphäre schützen',
          en: 'Protecting personal data and privacy',
        },
      },
      { code: '4.3', name: { es: 'Proteger la salud', de: 'Gesundheit schützen', en: 'Protecting health' } },
      {
        code: '4.4',
        name: {
          es: 'Proteger la naturaleza y el medio ambiente',
          de: 'Natur und Umwelt schützen',
          en: 'Protecting nature and the environment',
        },
      },
    ],
  },
  {
    code: '5',
    color: '#d97706',
    icon: 'puzzle',
    name: {
      es: 'Resolver problemas y actuar',
      de: 'Problemlösen und Handeln',
      en: 'Solving problems and acting',
    },
    description: {
      es: 'Resolver problemas técnicos, elegir la herramienta adecuada a cada necesidad, reconocer las propias carencias y emplear medios digitales para aprender, trabajar y pensar algorítmicamente.',
      de: 'Technische Probleme lösen, Werkzeuge bedarfsgerecht einsetzen, eigene Defizite erkennen und digitale Medien zum Lernen, Arbeiten und algorithmischen Denken nutzen.',
      en: 'Solve technical problems, choose suitable tools, recognise one’s own gaps and use digital media for learning, working and algorithmic thinking.',
    },
    subcompetencies: [
      {
        code: '5.1',
        name: {
          es: 'Resolver problemas técnicos',
          de: 'Technische Probleme lösen',
          en: 'Solving technical problems',
        },
      },
      {
        code: '5.2',
        name: {
          es: 'Emplear las herramientas adecuadas',
          de: 'Werkzeuge bedarfsgerecht einsetzen',
          en: 'Using tools appropriately',
        },
      },
      {
        code: '5.3',
        name: {
          es: 'Identificar las carencias propias y buscar soluciones',
          de: 'Eigene Defizite ermitteln und nach Lösungen suchen',
          en: 'Identifying own gaps and seeking solutions',
        },
      },
      {
        code: '5.4',
        name: {
          es: 'Usar medios digitales para aprender y trabajar',
          de: 'Digitale Werkzeuge und Medien zum Lernen, Arbeiten und Problemlösen nutzen',
          en: 'Using digital tools for learning, working and problem solving',
        },
      },
      {
        code: '5.5',
        name: {
          es: 'Reconocer y formular algoritmos',
          de: 'Algorithmen erkennen und formulieren',
          en: 'Recognising and formulating algorithms',
        },
      },
    ],
  },
  {
    code: '6',
    color: '#dc2626',
    icon: 'eye',
    name: {
      es: 'Analizar y reflexionar sobre los medios',
      de: 'Analysieren und Reflektieren',
      en: 'Analysing and reflecting',
    },
    description: {
      es: 'Examinar críticamente los medios digitales, reconocer intenciones e intereses detrás de los contenidos y comprender el efecto que la digitalización tiene sobre las personas y la sociedad.',
      de: 'Digitale Medien kritisch analysieren, Absichten und Interessen hinter Inhalten erkennen und die Wirkung der Digitalisierung auf Mensch und Gesellschaft verstehen.',
      en: 'Critically examine digital media, recognise the intentions and interests behind content, and understand the effect of digitalisation on people and society.',
    },
    subcompetencies: [
      {
        code: '6.1',
        name: {
          es: 'Analizar y valorar los medios',
          de: 'Medien analysieren und bewerten',
          en: 'Analysing and evaluating media',
        },
      },
      {
        code: '6.2',
        name: {
          es: 'Comprender y reflexionar sobre el mundo digital',
          de: 'Medien in der digitalen Welt verstehen und reflektieren',
          en: 'Understanding and reflecting on the digital world',
        },
      },
    ],
  },
];
