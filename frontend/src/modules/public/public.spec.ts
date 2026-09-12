import { beforeEach, describe, expect, it } from 'vitest';
import { RouterLinkStub, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n, setLanguage } from '@/app/i18n';
import HomeView from './HomeView.vue';
import WikiView from './WikiView.vue';

/**
 * Portada y guía.
 *
 * Se comprueban las dos cosas que una revisión a ojo no ve: que la página
 * cambia realmente de idioma con el selector —y no solo la interfaz, sino la
 * prosa, que vive fuera de los catálogos— y que el filtro por perfil de la
 * guía sigue dejando ver lo que vale para todo el mundo. Esto último es una
 * decisión de producto fácil de romper sin darse cuenta al tocar el filtro.
 */

const options = {
  global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub } },
};

beforeEach(() => {
  setActivePinia(createPinia());
  setLanguage('es');
});

describe('portada', () => {
  it('presenta los cuatro marcos y empieza por el que se mide', () => {
    const wrapper = mount(HomeView, options);

    const tabs = wrapper.findAll('[role="tab"]').map((tab) => tab.text());
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toContain('KMK');
    expect(wrapper.find('[role="tabpanel"]').text()).toContain('Buscar');
  });

  it('cambia de marco al pulsar una pestaña', async () => {
    const wrapper = mount(HomeView, options);

    const tabs = wrapper.findAll('[role="tab"]');
    await tabs[1]?.trigger('click');

    expect(wrapper.find('[role="tabpanel"]').text()).toContain('Empowered Learner');
  });

  it('advierte de que las correspondencias las traza el colegio', () => {
    const wrapper = mount(HomeView, options);

    // La tabla cruza marcos de tres organismos distintos y nadie la avala:
    // sin el aviso, la página estaría atribuyéndoles algo que no han dicho.
    expect(wrapper.find('[role="note"]').text()).toContain('colegio');
  });

  it('traduce también la prosa, no solo la interfaz', () => {
    setLanguage('de');
    const wrapper = mount(HomeView, options);

    expect(wrapper.text()).toContain('Digitale Kompetenzen wirklich bewerten');
    expect(wrapper.text()).not.toContain('no solo usarlos');
  });
});

describe('guía de uso', () => {
  it('muestra todas las secciones sin filtrar', () => {
    const wrapper = mount(WikiView, options);

    expect(wrapper.findAll('article')).toHaveLength(11);
  });

  it('al filtrar por estudiante conserva lo que vale para cualquiera', async () => {
    const wrapper = mount(WikiView, options);

    const buttons = wrapper.findAll('button');
    const student = buttons.find((button) => button.text() === 'Estudiantes');
    await student?.trigger('click');

    const ids = wrapper.findAll('article').map((article) => article.attributes('id'));
    expect(ids).toContain('estudiante-evaluacion');
    // Entrar y las recomendaciones son de todos: esconderlas al filtrar
    // dejaría fuera justo la sección que explica cómo se accede.
    expect(ids).toContain('acceso');
    expect(ids).toContain('recomendaciones');
    expect(ids).not.toContain('admin-plataforma');
  });

  it('describe las pantallas sin depender de capturas', () => {
    const wrapper = mount(WikiView, options);

    const sketches = wrapper.findAll('figure');
    expect(sketches.length).toBeGreaterThan(0);
    expect(wrapper.findAll('img')).toHaveLength(0);
  });
});
