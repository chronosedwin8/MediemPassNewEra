import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RichTextView from './RichTextView.vue';

/**
 * La segunda barrera al pintar contenido.
 *
 * La defensa que cuenta está en el servidor, al guardar: cualquiera puede
 * enviar un `PUT` saltándose el navegador. Esto es la red por debajo, para el
 * día en que entre contenido antiguo, importado o traído por otra vía.
 *
 * Ahora que el material lleva medios, lo que se comprueba aquí es que el visor
 * no incrusta lo que no está en la lista de plataformas, ni reproduce un medio
 * servido sin cifrar.
 */

function render(html: string) {
  return mount(RichTextView, { props: { html } });
}

describe('medios admitidos', () => {
  it('pinta un vídeo de YouTube', () => {
    const wrapper = render('<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>');

    expect(wrapper.find('iframe').attributes('src')).toBe(
      'https://www.youtube-nocookie.com/embed/abc',
    );
    // Con las mismas condiciones que impone el servidor.
    expect(wrapper.find('iframe').attributes('sandbox')).toContain('allow-scripts');
  });

  it('reproduce un vídeo servido por HTTPS', () => {
    const wrapper = render('<video src="https://cdn.example.org/clase.mp4" controls></video>');
    expect(wrapper.find('video').attributes('src')).toBe('https://cdn.example.org/clase.mp4');
  });
});

describe('lo que no está en la lista', () => {
  it('no incrusta un dominio cualquiera, y conserva el resto', () => {
    const wrapper = render(
      '<p>Antes</p><iframe src="https://sitio-cualquiera.example/login"></iframe>',
    );

    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.text()).toContain('Antes');
  });

  it('no se deja engañar por un dominio que termina igual', () => {
    const wrapper = render(
      '<iframe src="https://www.youtube-nocookie.com.atacante.example/embed/x"></iframe>',
    );

    expect(wrapper.find('iframe').exists()).toBe(false);
  });

  it('no reproduce un vídeo sin cifrar', () => {
    const wrapper = render('<video src="http://cdn.example.org/clase.mp4"></video>');
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('sigue descartando guiones', () => {
    const wrapper = render('<p>Texto</p><script>robar()</script>');

    expect(wrapper.html()).not.toContain('script');
    expect(wrapper.text()).toContain('Texto');
  });
});
