import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGES, type Language } from '@medienpass/shared';
import { publicContent } from './index';
import { es } from './es';

/**
 * Paridad entre los tres idiomas de la portada y la guía.
 *
 * El tipo `PublicContent` obliga a que estén todos los campos, pero no dice
 * nada del **número de elementos**: un alemán con cinco competencias KMK en
 * lugar de seis compila igual de bien, y el error no se ve hasta que alguien
 * lee la página en alemán y cuenta. Eso es lo que fija esta prueba.
 *
 * Se usa el español como referencia porque es el idioma en que se redactó y el
 * que revisa la coordinación del colegio.
 */

const OTHERS = SUPPORTED_LANGUAGES.filter((code) => code !== 'es') as Language[];

describe('contenido público', () => {
  it.each(OTHERS)('%s tiene la misma estructura que el español', (language) => {
    const other = publicContent(language);

    expect(other.home.why.points).toHaveLength(es.home.why.points.length);
    expect(other.home.crosswalk.rows).toHaveLength(es.home.crosswalk.rows.length);
    expect(other.home.ibLevels.levels).toHaveLength(es.home.ibLevels.levels.length);
    expect(other.home.access.roles.map((role) => role.key)).toEqual(
      es.home.access.roles.map((role) => role.key),
    );
  });

  it.each(OTHERS)('%s describe los cuatro marcos con los mismos elementos', (language) => {
    const other = publicContent(language).home.frameworks;

    for (const key of ['kmk', 'isteStudents', 'isteEducators', 'ib'] as const) {
      expect(other[key].items).toHaveLength(es.home.frameworks[key].items.length);
      // La fuente es la misma publicación en los tres idiomas: si alguien la
      // cambia en uno solo, la página deja de citar lo que dice citar.
      expect(other[key].source.url).toBe(es.home.frameworks[key].source.url);
    }
  });

  it.each(OTHERS)('%s cubre las mismas secciones de la guía', (language) => {
    const other = publicContent(language).wiki;

    expect(other.sections.map((section) => section.id)).toEqual(
      es.wiki.sections.map((section) => section.id),
    );
    expect(other.sections.map((section) => section.audience)).toEqual(
      es.wiki.sections.map((section) => section.audience),
    );
    expect(other.sections.map((section) => section.steps.length)).toEqual(
      es.wiki.sections.map((section) => section.steps.length),
    );
  });

  it.each(OTHERS)('%s conserva los bocetos de pantalla y sus zonas', (language) => {
    const other = publicContent(language).wiki;

    other.sections.forEach((section, index) => {
      const reference = es.wiki.sections[index];
      expect(Boolean(section.screen)).toBe(Boolean(reference?.screen));
      expect(section.screen?.regions.length ?? 0).toBe(reference?.screen?.regions.length ?? 0);
      expect(section.faq?.length ?? 0).toBe(reference?.faq?.length ?? 0);
    });
  });

  it('no deja ningún texto vacío', () => {
    /*
     * Un campo en blanco compila: el tipo pide `string` y `''` lo es. En la
     * página se ve como un hueco sin explicación, y es el fallo más probable
     * al traducir con prisa, así que se comprueba de forma recursiva.
     */
    const empty: string[] = [];

    function walk(value: unknown, path: string): void {
      if (typeof value === 'string') {
        if (value.trim().length === 0) empty.push(path);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
      }
    }

    for (const language of SUPPORTED_LANGUAGES) {
      walk(publicContent(language), language);
    }

    expect(empty).toEqual([]);
  });
});
