import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n, setLanguage } from '@/app/i18n';
import StarRating from './StarRating.vue';

/**
 * Las estrellas de la nota.
 *
 * Este componente invierte la intuición de cualquiera que haya visto estrellas
 * en una tienda: aquí cinco estrellas son un 1,0, la mejor nota de la escala
 * alemana. Las pruebas fijan las dos defensas contra el malentendido —el número
 * siempre visible y la descripción accesible que dice la nota, no el número de
 * estrellas— para que no se pierdan en un rediseño posterior.
 */

type StarRatingProps = InstanceType<typeof StarRating>['$props'];

function render(props: StarRatingProps) {
  return mount(StarRating, { props, global: { plugins: [i18n] } });
}

describe('estrellas', () => {
  it('pinta la mejor nota con todas las estrellas llenas', () => {
    const wrapper = render({ filled: 5, total: 5, value: 1, worstValue: 6, label: 'Excelente' });

    const filled = wrapper
      .findAll('svg')
      .filter((svg) => svg.attributes('fill') === 'currentColor');
    expect(filled).toHaveLength(5);
  });

  it('pinta la peor nota sin ninguna llena', () => {
    const wrapper = render({ filled: 0, total: 5, value: 6, worstValue: 6, label: 'Insuficiente' });

    const filled = wrapper
      .findAll('svg')
      .filter((svg) => svg.attributes('fill') === 'currentColor');
    expect(filled).toHaveLength(0);
    expect(wrapper.findAll('svg')).toHaveLength(5);
  });
});

describe('accesibilidad', () => {
  /**
   * Un lector de pantalla que enumerara «estrella, estrella, estrella…» daría
   * la información al revés de como es. Por eso los iconos se ocultan y el
   * significado viaja en texto.
   */
  it('oculta los iconos a las tecnologías de apoyo', () => {
    const wrapper = render({ filled: 5, total: 5, value: 1, worstValue: 6 });

    const icons = wrapper.find('svg').element.parentElement;
    expect(icons?.getAttribute('aria-hidden')).toBe('true');
  });

  it('describe la nota, no el número de estrellas', () => {
    setLanguage('es');
    const wrapper = render({ filled: 5, total: 5, value: 1, worstValue: 6, label: 'Excelente' });

    const description = wrapper.find('.sr-only').text();

    expect(description).toContain('1,0');
    expect(description).toContain('6,0');
    expect(description).toContain('Excelente');
    expect(description.toLowerCase()).not.toContain('estrella');
  });

  it('dice explícitamente que no hay nota cuando aún no la hay', () => {
    const wrapper = render({ filled: 0, total: 5, value: null });

    expect(wrapper.find('.sr-only').text()).toBe(i18n.global.t('grade.notAvailable'));
  });

  it('muestra siempre el valor numérico junto a las estrellas', () => {
    setLanguage('es');
    const wrapper = render({ filled: 4, total: 5, value: 2, worstValue: 6, label: 'Bien' });

    expect(wrapper.text()).toContain('2,0');
    expect(wrapper.text()).toContain('Bien');
  });

  it('incluye la leyenda que explica la escala invertida', () => {
    const wrapper = render({ filled: 5, total: 5, value: 1, worstValue: 6 });

    expect(wrapper.text()).toContain(i18n.global.t('grade.scaleLegend'));
  });

  it('permite ocultar la leyenda donde ya se explicó', () => {
    const wrapper = render({ filled: 5, total: 5, value: 1, worstValue: 6, showLegend: false });

    expect(wrapper.text()).not.toContain(i18n.global.t('grade.scaleLegend'));
  });
});

describe('idiomas', () => {
  it('traduce la descripción accesible', () => {
    setLanguage('de');
    const wrapper = render({ filled: 5, total: 5, value: 1, worstValue: 6, label: 'Sehr gut' });

    expect(wrapper.find('.sr-only').text()).toBe(
      i18n.global.t('grade.accessibleDescription', {
        value: '1,0',
        worst: '6,0',
        label: 'Sehr gut',
      }),
    );

    setLanguage('es');
  });
});
