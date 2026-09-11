/**
 * Contenido editorial de la portada y la wiki.
 *
 * Vive aparte de `locales/*.json` a propósito. Aquel catálogo es de **etiquetas
 * de interfaz** —botones, encabezados de tabla, mensajes de error— y se
 * mantiene ordenado porque cada entrada es corta y tiene un sitio claro. Esto
 * otro son párrafos: la explicación de qué es el marco KMK, cómo se recorre una
 * evaluación, qué conviene hacer antes de publicar. Meterlo en el mismo JSON lo
 * volvería inmanejable y mezclaría dos cosas que se editan por motivos
 * distintos y con ritmos distintos.
 *
 * La estructura está tipada para que las tres traducciones no se separen: si
 * alguien añade una sección a la versión en español y se olvida del alemán, es
 * un error de compilación y no una página con un hueco.
 */

export interface Highlight {
  /** Etiqueta corta, del tipo «KMK 1» o «Empowered Learner». */
  tag: string;
  title: string;
  body: string;
}

export interface FrameworkColumn {
  name: string;
  subtitle: string;
  intro: string;
  items: Highlight[];
  /** De dónde sale el marco, para que nadie tenga que fiarse de nosotros. */
  source: { label: string; url: string };
}

/** Una fila de la tabla que cruza los tres marcos. */
export interface CrosswalkRow {
  kmk: string;
  iste: string;
  ib: string;
  practice: string;
}

export interface HomeContent {
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    body: string;
  };
  why: {
    title: string;
    lead: string;
    points: Highlight[];
  };
  frameworks: {
    title: string;
    lead: string;
    kmk: FrameworkColumn;
    isteStudents: FrameworkColumn;
    isteEducators: FrameworkColumn;
    ib: FrameworkColumn;
  };
  crosswalk: {
    title: string;
    lead: string;
    caveat: string;
    columns: { kmk: string; iste: string; ib: string; practice: string };
    rows: CrosswalkRow[];
  };
  ibLevels: {
    title: string;
    lead: string;
    levels: Highlight[];
  };
  access: {
    title: string;
    lead: string;
    roles: Array<{
      key: 'student' | 'teacher' | 'admin';
      title: string;
      body: string;
      bullets: string[];
    }>;
  };
}

export interface WikiStep {
  title: string;
  body: string;
  /** Aviso o recomendación asociada al paso. */
  tip?: string;
}

export interface WikiSection {
  id: string;
  title: string;
  audience: 'teacher' | 'student' | 'admin' | 'all';
  lead: string;
  steps: WikiStep[];
  /** Boceto esquemático de la pantalla, si ayuda a situarse. */
  screen?: {
    title: string;
    caption: string;
    /** Zonas de la pantalla, de arriba abajo. */
    regions: Array<{ label: string; note: string; emphasis?: boolean }>;
  };
  faq?: Array<{ question: string; answer: string }>;
}

export interface WikiContent {
  title: string;
  lead: string;
  audiences: { all: string; teacher: string; student: string; admin: string };
  sections: WikiSection[];
}

export interface PublicContent {
  home: HomeContent;
  wiki: WikiContent;
}
